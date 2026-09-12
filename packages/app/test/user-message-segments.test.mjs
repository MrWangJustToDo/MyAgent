/**
 * Validates inline user-message segment parsing: image refs plus the
 * `<skill>` / `<memory>` blocks injected by `/skill` and `/memory`, which the
 * transcript collapses into compact chips.
 *
 * Run: pnpm --filter @my-agent/app build && node packages/app/test/user-message-segments.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { IMAGE_PLACEHOLDER_START, createImagePlaceholder, extractSubmittedInput, formatImageRef } = await import(
  new URL("../dist/utils/user-input-helpers.mjs", import.meta.url).href
);

const { parseUserMessageSegments, formatImageChipLabel, formatMemoryChipLabel, formatSkillChipLabel } = await import(
  new URL("../dist/utils/user-message-segments.mjs", import.meta.url).href
);

const { shortContentHash, clipboardImageFilename } = await import(
  new URL("../dist/utils/attachment-hash.mjs", import.meta.url).href
);

function attachment(filename) {
  return {
    path: "clipboard",
    filename,
    mediaType: "image/png",
    type: "image",
    size: 12,
    dataUrl: "data:image/png;base64,aaaa",
  };
}

test("extractSubmittedInput keeps image refs and attachment order", () => {
  const p0 = createImagePlaceholder(0);
  const p1 = createImagePlaceholder(1);
  const attachments = [];
  attachments[0] = attachment("clipboard-aaa.png");
  attachments[1] = attachment("clipboard-bbb.png");

  const raw = `before ${p0} mid ${p1} after`;
  const { text, attachments: ordered } = extractSubmittedInput(raw, attachments);

  assert.equal(
    text,
    `before ${formatImageRef(1, "clipboard-aaa.png")} mid ${formatImageRef(2, "clipboard-bbb.png")} after`
  );
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0].filename, "clipboard-aaa.png");
  assert.equal(ordered[1].filename, "clipboard-bbb.png");
  assert.equal(p0.charCodeAt(0), IMAGE_PLACEHOLDER_START);
});

test("parseUserMessageSegments splits refs for inline UI", () => {
  const text = `hello ${formatImageRef(1, "clipboard-aaa.png")} world ${formatImageRef(2, "clipboard-bbb.png")}`;
  const segments = parseUserMessageSegments(text);

  assert.deepEqual(segments, [
    { type: "text", content: "hello " },
    { type: "image", displayIndex: 1, filename: "clipboard-aaa.png" },
    { type: "text", content: " world " },
    { type: "image", displayIndex: 2, filename: "clipboard-bbb.png" },
  ]);
  assert.equal(formatImageChipLabel(1), "[Image #1]");
});

test("parseUserMessageSegments collapses a <skill> block into one segment", () => {
  const body = Array.from({ length: 6 }, (_, i) => `skill line ${i + 1}`).join("\n");
  const text = `<skill name="openspec-explore">\n${body}\n</skill>\n\nUser request with this skill:\ndo the thing`;
  const segments = parseUserMessageSegments(text);

  assert.deepEqual(segments, [
    { type: "skill", name: "openspec-explore", lineCount: 6 },
    { type: "text", content: "\n\nUser request with this skill:\ndo the thing" },
  ]);
  assert.equal(formatSkillChipLabel("openspec-explore"), "[Skill: openspec-explore]");
});

test("parseUserMessageSegments collapses a <memory> block and keeps its type", () => {
  const body = "line 1\nline 2\nline 3";
  const text = `<memory name="readme-github-content-decisions" type="project">\nsummary\n\n${body}\n</memory>`;
  const segments = parseUserMessageSegments(text);

  assert.deepEqual(segments, [
    { type: "memory", name: "readme-github-content-decisions", memoryType: "project", lineCount: 5 },
  ]);
  assert.equal(formatMemoryChipLabel("README", "project"), "[Memory: README (project)]");
  assert.equal(formatMemoryChipLabel("README"), "[Memory: README]");
});

test("parseUserMessageSegments leaves mid-sentence block quotes as plain text", () => {
  const text = `这个 <skill name="foo">\nbody\n</skill> 是什么意思？`;
  const segments = parseUserMessageSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, "text");
  assert.equal(segments[0].content, text);
});

test("parseUserMessageSegments anchors on the leading block only", () => {
  const text = `head <skill name="a">\ns1\n</skill> tail`;
  const segments = parseUserMessageSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, text);
});

test("parseUserMessageSegments keeps a leading block's follow-up text + image refs", () => {
  const text = `<skill name="a">\ns1\ns2\n</skill>\n\nUser request with this skill:\nsee ${formatImageRef(
    2,
    "clipboard-bbb.png"
  )}`;
  const segments = parseUserMessageSegments(text);

  assert.deepEqual(segments, [
    { type: "skill", name: "a", lineCount: 2 },
    { type: "text", content: "\n\nUser request with this skill:\nsee " },
    { type: "image", displayIndex: 2, filename: "clipboard-bbb.png" },
  ]);
});

test("parseUserMessageSegments does not collapse a nameless block", () => {
  const text = `<skill name="">\nbody\n</skill>`;
  const segments = parseUserMessageSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, text);
});

test("parseUserMessageSegments leaves an unterminated block as plain text", () => {
  const text = `<skill name="a">\nbody without close tag`;
  const segments = parseUserMessageSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, "text");
});

test("shortContentHash / clipboardImageFilename are deterministic", () => {
  const payload = "abc123base64payload";
  assert.equal(shortContentHash(payload), shortContentHash(payload));
  assert.equal(clipboardImageFilename(payload), `clipboard-${shortContentHash(payload)}.png`);
  assert.notEqual(shortContentHash(payload), shortContentHash(payload + "x"));
});

const { getMessages } = await import(new URL("../dist/utils/get-messages.mjs", import.meta.url).href);

test("getMessages keeps user text+image parts in one message", () => {
  const userMessage = {
    id: "u1",
    role: "user",
    parts: [
      { type: "text", content: `${formatImageRef(1, "clipboard-aaa.png")} test` },
      {
        type: "image",
        source: { type: "data", value: "data:image/png;base64,aaaa" },
        metadata: { mediaType: "image/png", filename: "clipboard-aaa.png" },
      },
    ],
  };
  const assistantMessage = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", content: "ok" }],
  };

  // User is not last → goes to static flatten path
  const { staticMessages } = getMessages([userMessage, assistantMessage]);
  const userRows = staticMessages.filter((m) => m.role === "user");
  assert.equal(userRows.length, 1);
  assert.equal(userRows[0].parts.length, 2);
  assert.equal(userRows[0].parts[0].type, "text");
  assert.equal(userRows[0].parts[1].type, "image");

  // User is last → dynamic path
  const { dynamicMessages } = getMessages([userMessage]);
  assert.equal(dynamicMessages.length, 1);
  assert.equal(dynamicMessages[0].parts.length, 2);
});
