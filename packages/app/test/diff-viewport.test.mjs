/**
 * Validates message diff viewport height helper.
 *
 * Run: node packages/app/test/diff-viewport.test.mjs
 */
import assert from "node:assert/strict";

import { getMessageDiffViewportHeight, MIN_MESSAGE_DIFF_HEIGHT } from "../dist/utils/diff-viewport.mjs";

assert.equal(getMessageDiffViewportHeight(0), MIN_MESSAGE_DIFF_HEIGHT);
assert.equal(getMessageDiffViewportHeight(30), MIN_MESSAGE_DIFF_HEIGHT);
assert.equal(getMessageDiffViewportHeight(42), 28);
assert.equal(getMessageDiffViewportHeight(45), 30);
assert.equal(getMessageDiffViewportHeight(60), 40);

console.log("diff-viewport validation passed");
