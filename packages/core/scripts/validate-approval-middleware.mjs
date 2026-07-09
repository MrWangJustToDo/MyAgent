/**
 * Validates approval middleware status transitions.
 *
 * Run: pnpm --filter @my-agent/core run validate:approval-middleware
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { createApprovalMiddleware } from "../dist/dev.mjs";

let status = "running";
let pendingCount = 0;
const events = [];

const middleware = createApprovalMiddleware({
  getStatus: () => status,
  setStatus: (next) => {
    status = next;
  },
  setPendingApprovalCount: (count) => {
    pendingCount = count;
  },
  log: null,
  emitEvent: (type, data) => {
    events.push({ type, data });
  },
});

await middleware.onToolPhaseComplete?.(undefined, {
  toolCalls: [],
  results: [],
  needsApproval: [
    {
      toolCallId: "call-1",
      toolName: "run_command",
      input: { command: "ls" },
      approvalId: "approval_call-1",
    },
  ],
  needsClientExecution: [],
});

assert.equal(status, "waiting");
assert.equal(pendingCount, 1);
assert.equal(events.length, 1);
assert.equal(events[0].type, "agent:tool-approval-request");
assert.equal(events[0].data.tool_name, "run_command");

await middleware.onBeforeToolCall?.(undefined, {
  toolName: "run_command",
  toolCallId: "call-1",
  args: { command: "ls" },
});

assert.equal(status, "running");
assert.equal(pendingCount, 0);

await middleware.onToolPhaseComplete?.(undefined, {
  toolCalls: [],
  results: [],
  needsApproval: [],
  needsClientExecution: [],
});

assert.equal(status, "running");
assert.equal(pendingCount, 0);

console.log("approval-middleware validation passed");
