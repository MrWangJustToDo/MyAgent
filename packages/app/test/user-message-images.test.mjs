/**
 * Validates image ref extract/parse helpers for inline user-message images.
 *
 * Run: pnpm --filter @my-agent/app build && node packages/app/test/user-message-images.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { IMAGE_PLACEHOLDER_START, createImagePlaceholder, extractSubmittedInput, formatImageRef } = await import(
  new URL("../dist/hooks/user-input-helpers.mjs", import.meta.url).href
);

const { parseUserMessageSegments, formatImageChipLabel } = await import(
  new URL("../dist/utils/user-message-images.mjs", import.meta.url).href
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
