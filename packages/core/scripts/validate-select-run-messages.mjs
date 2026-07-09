/**
 * Validates UIMessage-first run input selection (approval continuation).
 *
 * Run: pnpm --filter @my-agent/core run validate:select-run-messages
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { hasUIMessageParts, selectInitialRunMessages } from "../dist/dev.mjs";

const uiMessages = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", content: "run ls" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_cmd",
        name: "run_command",
        arguments: '{"command":"ls"}',
        state: "approval-responded",
        approval: { id: "approval_call_cmd", needsApproval: true, approved: true },
      },
    ],
  },
];

const prepared = [{ role: "user", content: "run ls" }];

const managed = {
  getContext: () => ({
    getUIMessages: () => [],
  }),
};

assert.equal(hasUIMessageParts(uiMessages), true);
assert.equal(hasUIMessageParts(prepared), false);

const selected = selectInitialRunMessages(uiMessages, prepared, managed);
assert.equal(selected, uiMessages);
assert.equal(selected[1].parts[0].approval.approved, true);
assert.equal(selected[1].parts[0].state, "approval-responded");

const fallback = selectInitialRunMessages(undefined, prepared, managed);
assert.deepEqual(fallback, prepared);

const emptyUiManaged = {
  getContext: () => ({
    getUIMessages: () => [],
  }),
};
assert.deepEqual(selectInitialRunMessages(undefined, prepared, emptyUiManaged), prepared);

console.log("select-run-messages validation passed");
