/**
 * Validation for plan-mode safe-command allowlist.
 *
 * Run: pnpm --filter @my-agent/core run validate:safe-command
 */

import assert from "node:assert/strict";

import { isSafeCommand } from "../dist/dev.mjs";

assert.equal(isSafeCommand("git status"), true);
assert.equal(isSafeCommand("git log --oneline -5"), true);
assert.equal(isSafeCommand("ls -la"), true);
assert.equal(isSafeCommand("cat README.md"), true);
assert.equal(isSafeCommand("rg TODO"), true);

assert.equal(isSafeCommand("rm -rf /tmp/x"), false);
assert.equal(isSafeCommand("git commit -m 'x'"), false);
assert.equal(isSafeCommand("npm install lodash"), false);
assert.equal(isSafeCommand("echo hi > file.txt"), false);
assert.equal(isSafeCommand(""), false);

console.log("validate:safe-command OK");
