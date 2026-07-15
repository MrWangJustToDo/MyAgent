/**
 * Validation for tool-phase continuation helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:tool-phase-utils
 */

import assert from "node:assert/strict";

import {
  hasApprovedToolsPendingExecution,
  hasDeferredToolExecution,
  isToolContinuationPrepare,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
} from "../dist/dev.mjs";

const mixedAssistant = {
  id: "a1",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_tree",
      name: "tree",
      arguments: "{}",
      state: "input-complete",
    },
    {
      type: "tool-call",
      id: "call_cmd",
      name: "run_command",
      arguments: "{}",
      state: "approval-responded",
      approval: { id: "approval_call_cmd", needsApproval: true, approved: true },
    },
  ],
};

assert.equal(hasDeferredToolExecution([mixedAssistant]), true);
assert.equal(needsToolPhaseContinue([mixedAssistant]), true);

const singleApproved = {
  id: "a2",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_cmd",
      name: "run_command",
      arguments: "{}",
      state: "approval-responded",
      approval: { id: "approval_call_cmd", needsApproval: true, approved: true },
    },
  ],
};

assert.equal(hasDeferredToolExecution([singleApproved]), false);
assert.equal(hasApprovedToolsPendingExecution([singleApproved]), true);
assert.equal(needsToolPhaseContinue([singleApproved]), true);

const askUserPending = {
  id: "a3",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_ask",
      name: "ask_user",
      arguments: "{}",
      state: "input-complete",
    },
  ],
};

assert.equal(hasDeferredToolExecution([askUserPending]), false);

const userTurn = { id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] };
const assistantTurn = { id: "a4", role: "assistant", parts: [{ type: "text", content: "ok" }] };

assert.equal(isToolContinuationPrepare("completed", [userTurn]), false);
assert.equal(isToolContinuationPrepare("completed", [userTurn, assistantTurn]), true);
assert.equal(isToolContinuationPrepare("waiting", [userTurn, singleApproved]), true);
assert.equal(isToolContinuationPrepare("idle", undefined), false);

const deniedWithResult = {
  id: "a5",
  role: "assistant",
  parts: [
    { type: "text", content: "I'll commit these changes." },
    {
      type: "tool-call",
      id: "call_cmd",
      name: "run_command",
      arguments: "{}",
      state: "approval-responded",
      approval: { id: "approval_call_cmd", needsApproval: true, approved: false, reason: "bad message" },
    },
    {
      type: "tool-result",
      toolCallId: "call_cmd",
      content: JSON.stringify({ approved: false, message: "bad message" }),
      state: "complete",
    },
  ],
};

assert.equal(hasApprovedToolsPendingExecution([deniedWithResult]), false);
assert.equal(needsToolPhaseContinue([deniedWithResult]), false);
assert.equal(needsAgentResponseAfterTools([deniedWithResult]), true);
assert.equal(shouldContinueAgentPump([deniedWithResult]), true);

const deniedWithFollowUp = {
  id: "a6",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_cmd",
      name: "run_command",
      arguments: "{}",
      state: "approval-responded",
      approval: { id: "approval_call_cmd", needsApproval: true, approved: false },
    },
    {
      type: "tool-result",
      toolCallId: "call_cmd",
      content: JSON.stringify({ approved: false, message: "no" }),
      state: "complete",
    },
    { type: "text", content: "Understood, I'll revise the commit message." },
  ],
};

assert.equal(needsAgentResponseAfterTools([deniedWithFollowUp]), false);

const deniedWithEmptyShellFollowUp = [deniedWithResult, { id: "empty-shell", role: "assistant", parts: [] }];

assert.equal(needsAgentResponseAfterTools(deniedWithEmptyShellFollowUp), true);
assert.equal(shouldContinueAgentPump(deniedWithEmptyShellFollowUp), true);

console.log("tool-phase-utils validation passed");
