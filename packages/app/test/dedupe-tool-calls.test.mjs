import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const {
  dedupeToolCallsInMessages,
  mergeToolCallPart,
  computeToolCallsRenderSignature,
  getUiToolState,
  normalizeToolPartsInMessages,
} = await import(new URL("../dist/index.mjs", import.meta.url).href);

test("mergeToolCallPart keeps first approval and adopts later complete state", () => {
  const primary = {
    type: "tool-call",
    id: "call-1",
    name: "run_command",
    arguments: JSON.stringify({ command: "ls" }),
    state: "approval-responded",
    approval: { needsApproval: true, approved: true },
  };
  const duplicate = {
    type: "tool-call",
    id: "call-1",
    name: "run_command",
    arguments: '{"command":"ls"}',
    state: "complete",
    output: { success: true, stdout: "ok" },
  };

  const merged = mergeToolCallPart(primary, duplicate);
  assert.equal(merged.state, "complete");
  assert.deepEqual(merged.output, { success: true, stdout: "ok" });
  assert.deepEqual(merged.approval, { needsApproval: true, approved: true });
});

test("dedupeToolCallsInMessages keeps first tool and drops replay", () => {
  const messages = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call-1",
          name: "grep",
          arguments: JSON.stringify({ pattern: "foo" }),
          state: "approval-responded",
          approval: { needsApproval: true, approved: true },
        },
      ],
    },
    {
      id: "msg-2",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call-1",
          name: "grep",
          arguments: '{"pattern":"foo"}',
          state: "complete",
          output: { matches: [], count: 0 },
        },
      ],
    },
  ];

  const deduped = dedupeToolCallsInMessages(messages);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].parts.length, 1);
  const tool = deduped[0].parts[0];
  assert.equal(tool.state, "complete");
  assert.equal(tool.output.count, 0);
});

test("computeToolCallsRenderSignature changes when merged tool state updates", () => {
  const before = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [{ type: "tool-call", id: "call-1", name: "grep", arguments: "{}", state: "input-complete" }],
    },
  ];
  const after = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call-1",
          name: "grep",
          arguments: "{}",
          state: "complete",
          output: { ok: true },
        },
      ],
    },
  ];

  assert.notEqual(computeToolCallsRenderSignature(before), computeToolCallsRenderSignature(after));
});

test("getUiToolState shows complete when output exists during approval-responded", () => {
  const part = {
    type: "tool-call",
    id: "call-1",
    name: "run_command",
    arguments: "{}",
    state: "approval-responded",
    approval: { needsApproval: true, approved: true },
    output: { success: false, stdout: "lint failed", stderr: "" },
  };

  assert.equal(getUiToolState(part), "output-error");
});

test("dedupeToolCallsInMessages fast path returns same reference when no duplicates", () => {
  const messages = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [{ type: "tool-call", id: "call-1", name: "grep", arguments: "{}", state: "complete" }],
    },
    {
      id: "msg-2",
      role: "assistant",
      parts: [{ type: "tool-call", id: "call-2", name: "read_file", arguments: "{}", state: "complete" }],
    },
  ];

  assert.equal(dedupeToolCallsInMessages(messages), messages);
});

test("normalizeToolPartsInMessages folds tool-result into tool-call and removes result row", () => {
  const messages = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call-1",
          name: "webfetch",
          arguments: '{"url":"https://example.com"}',
          state: "input-complete",
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          state: "error",
          content: '{"error":"fetch failed"}',
        },
      ],
    },
  ];

  const normalized = normalizeToolPartsInMessages(messages);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].parts.length, 1);
  const tool = normalized[0].parts[0];
  assert.equal(tool.type, "tool-call");
  assert.equal(tool.state, "error");
  assert.deepEqual(tool.output, { error: "fetch failed" });
});
