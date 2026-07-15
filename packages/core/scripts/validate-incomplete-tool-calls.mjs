/**
 * Validates cancelIncompleteToolCalls cleanup used after abort.
 *
 * Run: pnpm --filter @my-agent/core run validate:incomplete-tool-calls
 */

import assert from "node:assert/strict";

import {
  TOOL_CANCELLED_MESSAGE,
  cancelIncompleteToolCalls,
  hasCancellableIncompleteToolCalls,
  hasValidToolArguments,
  isCancellableIncompleteToolCall,
} from "../dist/dev.mjs";

const streaming = {
  type: "tool-call",
  id: "call_1",
  name: "task",
  arguments: '{"description": "分析 Core',
  state: "input-streaming",
};

assert.equal(isCancellableIncompleteToolCall(streaming), true);
assert.equal(hasValidToolArguments(streaming), false);

assert.equal(
  isCancellableIncompleteToolCall({
    ...streaming,
    state: "input-complete",
    arguments: '{"ok":true}',
  }),
  false,
  "valid input-complete must wait for tool-phase, not cancel"
);

assert.equal(
  isCancellableIncompleteToolCall({
    ...streaming,
    state: "input-complete",
    arguments: '{"description": "分析 Core',
  }),
  true,
  "truncated input-complete after abort must cancel"
);

assert.equal(
  isCancellableIncompleteToolCall({
    type: "tool-call",
    id: "call_run",
    name: "run_command",
    arguments: '{"command":"git status"}',
    state: "approval-responded",
    approval: { id: "a1", needsApproval: true, approved: true },
  }),
  false,
  "approved tools (user pressed y) must not be cancelled"
);

assert.equal(
  isCancellableIncompleteToolCall({
    ...streaming,
    state: "approval-requested",
    approval: { id: "a1", needsApproval: true },
  }),
  false
);

assert.equal(
  isCancellableIncompleteToolCall({
    ...streaming,
    state: "complete",
    output: { ok: true },
  }),
  false
);

const messages = [
  {
    id: "a1",
    role: "assistant",
    parts: [streaming],
  },
];

assert.equal(hasCancellableIncompleteToolCalls(messages), true);

const cancelled = cancelIncompleteToolCalls(messages);
assert.equal(hasCancellableIncompleteToolCalls(cancelled), false);
const part = cancelled[0].parts[0];
assert.equal(part.state, "error");
assert.equal(part.output.error, TOOL_CANCELLED_MESSAGE);
assert.equal(cancelled[0].parts[1].type, "tool-result");
assert.equal(cancelled[0].parts[1].toolCallId, "call_1");

const again = cancelIncompleteToolCalls(cancelled);
assert.equal(again, cancelled);

console.log("incomplete-tool-calls validation passed");
