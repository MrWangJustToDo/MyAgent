/**
 * Validation for empty TanStack assistant shell detection and cleanup.
 *
 * Run: pnpm --filter @my-agent/core run validate:empty-assistant-shell
 */

import assert from "node:assert/strict";

import { findLastMeaningfulAssistant, isEmptyAssistantShell, stripEmptyAssistantShells } from "../dist/dev.mjs";

const emptyShell = { id: "empty", role: "assistant", parts: [] };
const whitespaceShell = {
  id: "ws",
  role: "assistant",
  parts: [{ type: "text", content: "  \n  " }],
};
const thinkingOnly = {
  id: "think",
  role: "assistant",
  parts: [{ type: "thinking", content: "planning..." }],
};
const toolTurn = {
  id: "tools",
  role: "assistant",
  parts: [
    {
      type: "tool-call",
      id: "call_cmd",
      name: "run_command",
      arguments: "{}",
      state: "approval-responded",
      approval: { id: "approval_1", needsApproval: true, approved: false },
    },
    {
      type: "tool-result",
      toolCallId: "call_cmd",
      content: JSON.stringify({ approved: false, message: "no" }),
      state: "complete",
    },
  ],
};

assert.equal(isEmptyAssistantShell(emptyShell), true);
assert.equal(isEmptyAssistantShell(whitespaceShell), true);
assert.equal(isEmptyAssistantShell(thinkingOnly), false);
assert.equal(isEmptyAssistantShell(toolTurn), false);

assert.deepEqual(stripEmptyAssistantShells([toolTurn, emptyShell]), [toolTurn]);
assert.deepEqual(stripEmptyAssistantShells([toolTurn, emptyShell, whitespaceShell]), [toolTurn]);
assert.equal(findLastMeaningfulAssistant([toolTurn, emptyShell])?.id, "tools");

console.log("empty-assistant-shell validation passed");
