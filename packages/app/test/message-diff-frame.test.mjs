/**
 * Validates edit/write diff frame color helper (single border for status + focus).
 *
 * Run: node packages/app/test/message-diff-frame.test.mjs
 */
import assert from "node:assert/strict";

import { approvalFrameColor } from "../dist/utils/diff-frame.mjs";

const pending = approvalFrameColor(undefined);
const approved = approvalFrameColor(true);
const denied = approvalFrameColor(false);

assert.equal(typeof pending, "string");
assert.equal(typeof approved, "string");
assert.equal(typeof denied, "string");
assert.notEqual(approved, denied);
assert.notEqual(pending, approved);
assert.notEqual(pending, denied);

console.log("message-diff-frame validation passed");
