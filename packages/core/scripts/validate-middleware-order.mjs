/**
 * Validates the middleware phase pipeline (change: middleware-phase-pipeline):
 *
 * 1. Every middleware factory declares a phase, and the phases agree with the
 *    canonical pipeline order (`CANONICAL_MIDDLEWARE_ORDER`).
 * 2. `sortMiddlewaresByPhase` is stable and resolves the declared phases to
 *    exactly the historical array order (zero-behavior-change guarantee).
 * 3. Undeclared-phase middlewares fall through the sort and surface a warning.
 *
 * Run: pnpm --filter @my-agent/core run validate:middleware-order
 */

import assert from "node:assert/strict";

import {
  CANONICAL_MIDDLEWARE_ORDER,
  createApprovalResumeMiddleware,
  createBackgroundNotificationMiddleware,
  createCompactionMiddleware,
  createEarlyToolResultUiMiddleware,
  createExtensionsMiddleware,
  createLifecycleMiddleware,
  createPlanModeMiddleware,
  createPromptCacheMiddleware,
  createStatusMiddleware,
  createTaskPreforkMiddleware,
  createToolCompactMiddleware,
  createTurnContextMiddleware,
  MIDDLEWARE_PHASE_RANK,
  sortMiddlewaresByPhase,
} from "../dist/dev.mjs";

/**
 * Universal self-returning stub: satisfies any deps object without calling
 * into real behavior (factories only store deps at creation time).
 */
function makeStub() {
  const stub = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === "then") return undefined;
      return stub;
    },
    apply() {
      return stub;
    },
  });
  return stub;
}

const FACTORIES = [
  createStatusMiddleware,
  createApprovalResumeMiddleware,
  createLifecycleMiddleware,
  createCompactionMiddleware,
  createToolCompactMiddleware,
  createTurnContextMiddleware,
  createExtensionsMiddleware,
  createEarlyToolResultUiMiddleware,
  createTaskPreforkMiddleware,
  createPlanModeMiddleware,
  createBackgroundNotificationMiddleware,
  createPromptCacheMiddleware,
];

// --- 1. Every factory declares a phase; names match the canonical snapshot ---

const assembled = FACTORIES.map((factory) => factory(makeStub()));
const names = assembled.map((mw) => mw.name);
assert.deepEqual(names, [...CANONICAL_MIDDLEWARE_ORDER], "factory names must match the canonical order snapshot");
assert.ok(
  assembled.every((mw) => typeof mw.phase === "string"),
  "every middleware declares a phase"
);

// --- 2. Phase-sorted order === historical order (zero behavior change) ---

const warnings = [];
const sorted = sortMiddlewaresByPhase(assembled, (message) => warnings.push(message));
assert.equal(warnings.length, 0, "no undeclared-phase warnings expected");
assert.deepEqual(
  sorted.map((mw) => mw.name),
  [...CANONICAL_MIDDLEWARE_ORDER],
  "phase sort must resolve to the canonical order"
);

// Phase ranks are non-decreasing along the sorted pipeline.
for (let i = 1; i < sorted.length; i++) {
  const prev = MIDDLEWARE_PHASE_RANK[sorted[i - 1].phase];
  const curr = MIDDLEWARE_PHASE_RANK[sorted[i].phase];
  assert.ok(prev <= curr, `phase ranks must be non-decreasing at ${sorted[i].name}`);
}

// --- 3. Undeclared phase surfaces a warning and sorts last ---

const unphased = { name: "unphased-experiment" };
const warnings2 = [];
const mixed = sortMiddlewaresByPhase([{ name: "status", phase: "observe" }, unphased], (m) => warnings2.push(m));
assert.equal(warnings2.length, 1, "undeclared phase warns once");
assert.equal(mixed.at(-1).name, "unphased-experiment", "unphased middleware sorts last");

console.log("middleware-order validation passed");
