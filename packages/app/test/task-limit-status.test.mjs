/**
 * Validates that a `task` run cut off by the step budget renders as a warning
 * rather than a clean finish.
 *
 * Run: node packages/app/test/task-limit-status.test.mjs
 */
import assert from "node:assert/strict";

import { getToolStatusGlyph, isBudgetCutoffTaskPhase } from "../dist/index.mjs";

// --- phase -> cutoff decision ---

// Only `limit` means the budget ended the run. `summary` is the subagent's own
// report, and `running` has not ended at all.
assert.equal(isBudgetCutoffTaskPhase("limit"), true);
assert.equal(isBudgetCutoffTaskPhase("summary"), false);
assert.equal(isBudgetCutoffTaskPhase("running"), false);
// `taskPhase` is optional: an absent value must degrade to the old behaviour
// (no cutoff styling) instead of assuming one.
assert.equal(isBudgetCutoffTaskPhase(undefined), false);

// --- glyph ---

// The regression this guards: a cut-off task's part still settles as
// `output-available`, so reading the tool state alone painted the clean-finish
// check on a truncated run.
assert.equal(getToolStatusGlyph("output-available"), "✓", "a settled part reads as success by default");
assert.equal(getToolStatusGlyph("output-available", true), "⚠", "a cutoff outranks the settled state");
assert.equal(getToolStatusGlyph("output-error"), "✗");
assert.equal(getToolStatusGlyph("output-error", true), "⚠", "cutoff styling is not limited to the success state");
assert.equal(getToolStatusGlyph("output-denied"), "✗");
assert.equal(getToolStatusGlyph("approval-requested"), "?", "lifecycle states carry their own glyph");
assert.equal(getToolStatusGlyph("input-streaming"), "", "streaming renders a spinner, not a glyph");

console.log("task-limit-status validation passed");
