/**
 * Validates git info formatting for the header.
 *
 * Run: node packages/app/test/workspace-git-info.test.mjs
 */
import assert from "node:assert/strict";

import { formatWorkspaceGitInfo } from "../dist/utils/workspace-git-info.mjs";

assert.equal(formatWorkspaceGitInfo({ branch: "main", shortSha: "abc1234", dirty: false }), "main abc1234");
assert.equal(formatWorkspaceGitInfo({ branch: "main", shortSha: "abc1234", dirty: true }), "main* abc1234");
assert.equal(
  formatWorkspaceGitInfo({ branch: "detached@abc1234", shortSha: "abc1234", dirty: false }),
  "detached@abc1234"
);

console.log("workspace-git-info validation passed");
