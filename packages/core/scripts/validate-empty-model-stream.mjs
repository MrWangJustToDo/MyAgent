/**
 * Validation for empty-model-stream detection (SSO/HTML → zero chunk streams).
 *
 * Run: pnpm --filter @my-agent/core run validate:empty-model-stream
 */

import assert from "node:assert/strict";

import { EMPTY_MODEL_STREAM_MESSAGE, didStreamProduceModelOutput, shouldFlagEmptyModelStream } from "../dist/dev.mjs";

const user = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", content: "test" }],
};

const assistantText = {
  id: "a1",
  role: "assistant",
  parts: [{ type: "text", content: "hello" }],
};

const emptyShell = {
  id: "a-empty",
  role: "assistant",
  parts: [],
};

const assistantToolPending = {
  id: "a2",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_1",
      name: "read_file",
      arguments: '{"path":"a.ts"}',
      state: "input-complete",
    },
  ],
};

const assistantToolDone = {
  id: "a2",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_1",
      name: "read_file",
      arguments: '{"path":"a.ts"}',
      state: "complete",
      output: { content: "ok" },
    },
  ],
};

assert.equal(typeof EMPTY_MODEL_STREAM_MESSAGE, "string");
assert.ok(EMPTY_MODEL_STREAM_MESSAGE.length > 0);

// User turn + empty stream (SSO HTML case): flag error.
assert.equal(shouldFlagEmptyModelStream([user], [user]), true);
assert.equal(didStreamProduceModelOutput([user], [user]), false);

// Empty assistant shell stripped / left behind still counts as no output.
assert.equal(shouldFlagEmptyModelStream([user], [user, emptyShell]), true);

// Normal text reply.
assert.equal(shouldFlagEmptyModelStream([user], [user, assistantText]), false);
assert.equal(didStreamProduceModelOutput([user], [user, assistantText]), true);

// Tool-phase continue: same assistant id, tool gains output → progress.
assert.equal(shouldFlagEmptyModelStream([user, assistantToolPending], [user, assistantToolDone]), false);

// Tool-phase with zero progress → flag.
assert.equal(shouldFlagEmptyModelStream([user, assistantToolPending], [user, assistantToolPending]), true);

console.log("empty-model-stream validation passed");
