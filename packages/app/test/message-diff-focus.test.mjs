/**
 * Validates dynamic message diff focus helpers.
 *
 * Run: node packages/app/test/message-diff-focus.test.mjs
 */
import assert from "node:assert/strict";

import { resolveFocusedPendingApproval } from "../dist/hooks/use-message-diff-focus.mjs";

const pending = [
  { id: "a1", toolName: "write_file", toolCallId: "t1" },
  { id: "a2", toolName: "edit_file", toolCallId: "t2" },
];

assert.deepEqual(resolveFocusedPendingApproval(pending, [], 0), pending[0]);

assert.deepEqual(
  resolveFocusedPendingApproval(
    pending,
    [
      { toolCallId: "t1", approvalId: "a1" },
      { toolCallId: "t2", approvalId: "a2" },
    ],
    1
  ),
  pending[1]
);

assert.equal(resolveFocusedPendingApproval(pending, [{ toolCallId: "t9", approvalId: "missing" }], 0), undefined);

console.log("message-diff-focus validation passed");
