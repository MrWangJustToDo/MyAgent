/**
 * Validates generateId collision avoidance.
 *
 * Run: pnpm --filter @my-agent/core run validate:generate-id
 */
import assert from "node:assert/strict";

import { generateId, resetGeneratedIdsForTesting } from "../dist/dev.mjs";

resetGeneratedIdsForTesting();

const a = generateId("subagent");
const b = generateId("subagent");
assert.notEqual(a, b);
assert.ok(a.startsWith("subagent_"));
assert.ok(b.startsWith("subagent_"));

const taken = new Set([a]);
// Force exists to reject until we get a fresh id
let calls = 0;
const withExists = generateId("subagent", {
  exists: (id) => {
    calls += 1;
    return taken.has(id);
  },
});
assert.notEqual(withExists, a);
assert.ok(withExists.startsWith("subagent_"));
assert.ok(calls >= 1);

resetGeneratedIdsForTesting();
console.log("generate-id validation passed");
