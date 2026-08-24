/**
 * Validates the per-task run-phase state machine (TaskRunState).
 *
 * Run: pnpm --filter @my-agent/core run validate:task-run-state
 */

import assert from "node:assert/strict";

import { TaskRunState } from "../dist/dev.mjs";

const { beginTaskRun, clearTaskRuns, enterTaskSummaryPhase, getTaskRunState, readTaskRunPhase } =
  await import("../dist/dev.mjs");

// --- defaults ---

const parent = {};
assert.equal(readTaskRunPhase(parent, "t1"), "running", "unknown tasks default to running");
assert.equal(readTaskRunPhase(parent, undefined), "running");
assert.equal(getTaskRunState(parent, "t1"), undefined);

// --- register + one-way transition ---

{
  const state = beginTaskRun(parent, "t1");
  assert.ok(state instanceof TaskRunState);
  assert.equal(state.phase, "running");
  assert.equal(getTaskRunState(parent, "t1"), state);

  assert.equal(enterTaskSummaryPhase(parent, "t1"), true, "first transition reports change");
  assert.equal(state.phase, "summary");
  assert.equal(enterTaskSummaryPhase(parent, "t1"), false, "transition is idempotent");
  assert.equal(state.phase, "summary", "one-way: summary never reverts to running");
}

// --- registries are per-parent ---

{
  const parentA = {};
  const parentB = {};
  beginTaskRun(parentA, "shared");
  enterTaskSummaryPhase(parentA, "shared");
  assert.equal(readTaskRunPhase(parentB, "shared"), "running", "parents have isolated registries");
}

// --- unknown id transition is a safe no-op ---

assert.equal(enterTaskSummaryPhase(parent, ""), false);
assert.equal(enterTaskSummaryPhase(parent, "never-registered"), true, "auto-registers then transitions");
assert.equal(readTaskRunPhase(parent, "never-registered"), "summary");

// --- cleanup ---

clearTaskRuns(parent);
assert.equal(readTaskRunPhase(parent, "t1"), "running", "clear resets all tasks");
beginTaskRun(parent, "keep-me");
beginTaskRun(parent, "drop-me");
clearTaskRuns(parent, "drop-me");
assert.ok(getTaskRunState(parent, "keep-me"));
assert.equal(getTaskRunState(parent, "drop-me"), undefined);

console.log("task-run-state validation passed");
