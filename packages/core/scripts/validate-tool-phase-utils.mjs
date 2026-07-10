/**
 * Validation for tool-phase continuation helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:tool-phase-utils
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  hasApprovedToolsPendingExecution,
  hasDeferredToolExecution,
  isToolContinuationPrepare,
  needsToolPhaseContinue,
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

const deniedPending = {
  id: "a5",
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
  ],
};

assert.equal(hasApprovedToolsPendingExecution([deniedPending]), true);
assert.equal(needsToolPhaseContinue([deniedPending]), true);

console.log("tool-phase-utils validation passed");
