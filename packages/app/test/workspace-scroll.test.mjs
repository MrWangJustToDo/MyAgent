/**
 * Validates workspace scroll helpers.
 *
 * Run: node packages/app/test/workspace-scroll.test.mjs
 */
import assert from "node:assert/strict";

import { clampScrollTop, ensureIndexVisible } from "../dist/utils/workspace-scroll.mjs";

assert.equal(ensureIndexVisible(0, 0, 5, 10), 0);
assert.equal(ensureIndexVisible(6, 0, 5, 10), 2);
assert.equal(ensureIndexVisible(3, 2, 5, 10), 2);

assert.equal(clampScrollTop(-3, 20, 5), 0);
assert.equal(clampScrollTop(99, 20, 5), 15);
assert.equal(clampScrollTop(4, 20, 5), 4);

console.log("workspace-scroll validation passed");
