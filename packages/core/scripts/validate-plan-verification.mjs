/**
 * Validates plan verification parse + complete_plan gate helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:plan-verification
 */

import assert from "node:assert/strict";

import {
  gateCompletePlanVerification,
  isUsableVerification,
  parseVerificationItemsFromPlanMarkdown,
  parseVerificationItemsFromText,
} from "../dist/dev.mjs";

const items = parseVerificationItemsFromText(`- resume shows images
- pnpm --filter @my-agent/core run validate:media-store
1. session JSON has no inline base64`);
assert.deepEqual(items, [
  "resume shows images",
  "pnpm --filter @my-agent/core run validate:media-store",
  "session JSON has no inline base64",
]);

assert.equal(isUsableVerification(""), false);
assert.equal(isUsableVerification("   "), false);
assert.equal(isUsableVerification("- ok check"), true);
assert.equal(isUsableVerification("pnpm lint"), true);

const md = `## Plan

**Goal:** demo

**Steps:**
1. Do thing

**Verification:**
- resume shows images
- run validate:media-store

**Risks / trade-offs:**
none
`;

assert.deepEqual(parseVerificationItemsFromPlanMarkdown(md), ["resume shows images", "run validate:media-store"]);

assert.equal(gateCompletePlanVerification(md, undefined).ok, false);
assert.equal(gateCompletePlanVerification(md, []).ok, false);

const failGate = gateCompletePlanVerification(md, [
  { item: "resume shows images", passed: false, evidence: "broke" },
  { item: "run validate:media-store", passed: true, evidence: "ok" },
]);
assert.equal(failGate.ok, false);

const missGate = gateCompletePlanVerification(md, [{ item: "resume shows images", passed: true, evidence: "ui ok" }]);
assert.equal(missGate.ok, false);

const okGate = gateCompletePlanVerification(md, [
  { item: "resume shows images", passed: true, evidence: "ui ok after /resume" },
  { item: "run validate:media-store", passed: true, evidence: "validate:media-store passed" },
]);
assert.equal(okGate.ok, true);

const legacy = gateCompletePlanVerification("## Plan\n\n**Goal:** old\n", [
  { item: "N/A — smoke validate", passed: true, evidence: "pnpm build:core" },
]);
assert.equal(legacy.ok, true);

const legacyBad = gateCompletePlanVerification("## Plan\n\n**Goal:** old\n", [
  { item: "a", passed: true, evidence: "x" },
  { item: "b", passed: true, evidence: "y" },
]);
assert.equal(legacyBad.ok, false);

console.log("plan-verification validation passed");
