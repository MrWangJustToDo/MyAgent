/**
 * Validates unified status middleware approval transitions.
 *
 * Run: pnpm --filter @my-agent/core run validate:status-middleware
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { AgentStatusController, createStatusMiddleware } from "../dist/dev.mjs";

let status = "running";
let pendingCount = 0;
const events = [];

const controller = new AgentStatusController({
  getStatus: () => status,
  setStatus: (next) => {
    status = next;
  },
  getError: () => "",
  setError: () => {},
  setPendingApprovalCount: (count) => {
    pendingCount = count;
  },
  emitEvent: (type, data) => {
    events.push({ type, data });
  },
});

const middleware = createStatusMiddleware({
  status: controller,
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

await middleware.onBeforeToolCall?.(undefined, {
  toolCallId: "call-1",
  toolName: "run_command",
  input: {},
});

assert.equal(status, "running");
assert.equal(pendingCount, 0);

console.log("status-middleware validation passed");
