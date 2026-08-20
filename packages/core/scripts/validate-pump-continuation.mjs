/**
 * Validates mid-run queue deferral (pumpDepth vs stale status).
 *
 * Run: pnpm --filter @my-agent/core run validate:pump-continuation
 */
import assert from "node:assert/strict";

import { isStaleActiveRunStatus, shouldDeferMidRunQueue } from "../dist/dev.mjs";

assert.equal(shouldDeferMidRunQueue({ pumpDepth: 1, status: "running" }), true, "active pump defers");
assert.equal(shouldDeferMidRunQueue({ pumpDepth: 0, status: "waiting" }), true, "approval wait defers");
assert.equal(shouldDeferMidRunQueue({ pumpDepth: 0, status: "awaiting_user" }), true, "ask_user defers");

assert.equal(
  shouldDeferMidRunQueue({ pumpDepth: 0, status: "running" }),
  false,
  "stale running after pump exit must not defer"
);
assert.equal(shouldDeferMidRunQueue({ pumpDepth: 0, status: "responding" }), false, "stale responding must not defer");
assert.equal(shouldDeferMidRunQueue({ pumpDepth: 0, status: "completed" }), false, "completed allows send");
assert.equal(shouldDeferMidRunQueue({ pumpDepth: 0, status: "idle" }), false, "idle allows send");

assert.equal(isStaleActiveRunStatus({ pumpDepth: 0, status: "running" }), true, "stale running is detectable");
assert.equal(isStaleActiveRunStatus({ pumpDepth: 1, status: "running" }), false, "live pump is not stale");
assert.equal(isStaleActiveRunStatus({ pumpDepth: 0, status: "waiting" }), false, "waiting is intentional pause");

console.log("validate:pump-continuation passed");
