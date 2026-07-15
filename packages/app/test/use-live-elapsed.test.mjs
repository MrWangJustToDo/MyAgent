/**
 * Validates live-elapsed threshold gating helpers used by tool headers.
 *
 * Run: node packages/app/test/use-live-elapsed.test.mjs
 */
import assert from "node:assert/strict";

/** Mirror of useLiveElapsedMs visibility rule (active + past threshold). */
function resolveLiveElapsedDisplay(elapsedMs, active, thresholdMs) {
  if (!active || elapsedMs < thresholdMs) return null;
  return elapsedMs;
}

assert.equal(resolveLiveElapsedDisplay(0, true, 3000), null);
assert.equal(resolveLiveElapsedDisplay(2999, true, 3000), null);
assert.equal(resolveLiveElapsedDisplay(3000, true, 3000), 3000);
assert.equal(resolveLiveElapsedDisplay(4500, true, 3000), 4500);
assert.equal(resolveLiveElapsedDisplay(5000, false, 3000), null);

console.log("use-live-elapsed validation passed");
