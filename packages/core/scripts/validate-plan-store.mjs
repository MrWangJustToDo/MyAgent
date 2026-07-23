/**
 * Validation for plan-store path helpers (no CoreEnv required).
 *
 * Run: pnpm --filter @my-agent/core run validate:plan-store
 */
import assert from "node:assert/strict";

import { PLAN_STORE_DIR, planFilePath, slugifyPlanName } from "../dist/dev.mjs";

assert.equal(PLAN_STORE_DIR, ".agents/plans");
assert.equal(slugifyPlanName("Add Worktree Support!"), "add-worktree-support");
assert.ok(planFilePath("Add Worktree").endsWith(".md"));
assert.ok(planFilePath("Add Worktree").startsWith(".agents/plans/"));
assert.equal(planFilePath("foo.md"), planFilePath("foo"));

console.log("validate:plan-store OK");
