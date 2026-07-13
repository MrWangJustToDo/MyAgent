/**
 * Validates workspace git diff helpers.
 *
 * Run: node packages/app/test/workspace-git-diff.test.mjs
 */
import assert from "node:assert/strict";

import { quoteShellArg } from "../dist/utils/workspace-git-diff.mjs";

assert.equal(quoteShellArg("src/foo.ts"), "'src/foo.ts'");
assert.equal(quoteShellArg("path with spaces"), "'path with spaces'");
assert.equal(quoteShellArg("it's fine"), "'it'\\''s fine'");

console.log("workspace-git-diff validation passed");
