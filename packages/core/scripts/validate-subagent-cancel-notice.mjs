/**
 * Validation for subagent stop notices appended into task summaries.
 *
 * Run: pnpm --filter @codent/core run validate:subagent-cancel-notice
 */

import assert from "node:assert/strict";

import {
  applySubagentCancelNotice,
  applySubagentStopNotice,
  resolveSubagentStopReason,
  subagentStopNotice,
  SUBAGENT_ABORTED_NOTICE,
  SUBAGENT_CANCELLED_NOTICE,
  SUBAGENT_PARENT_RUN_NOTICE,
  SUBAGENT_PARENT_STOP_NOTICE,
  SUBAGENT_STOP_NOTICES,
} from "../dist/dev.mjs";

// --- back-compat wrapper (plain `aborted` flag) ---

assert.equal(applySubagentCancelNotice("partial findings", false), "partial findings");
assert.equal(applySubagentCancelNotice("(no summary)", true), SUBAGENT_CANCELLED_NOTICE);
assert.equal(applySubagentCancelNotice("   ", true), SUBAGENT_CANCELLED_NOTICE);

const withPartial = applySubagentCancelNotice("Now let me explore…", true);
assert.ok(withPartial.startsWith("Now let me explore…"));
assert.ok(withPartial.includes(SUBAGENT_CANCELLED_NOTICE));

const already = `${SUBAGENT_CANCELLED_NOTICE}`;
assert.equal(applySubagentCancelNotice(already, true), already);

// --- the reason classifier: the abort reason is the channel every path uses ---

assert.equal(resolveSubagentStopReason({ aborted: false, reason: "user-cancelled" }), "unknown", "no abort → no claim");
assert.equal(resolveSubagentStopReason({ aborted: true, reason: "user-cancelled" }), "user", "Esc passes this down");
assert.equal(resolveSubagentStopReason({ aborted: true, reason: "parent-aborted" }), "parent-stop");
assert.equal(resolveSubagentStopReason({ aborted: true, reason: "agent-destroyed" }), "parent-stop");

// The orphan case: `resetRunState` calls `abort()` with no reason — a bare abort is the run
// moving on, NOT a user cancel. This is the misattribution the reason exists to fix.
assert.equal(resolveSubagentStopReason({ aborted: true, reason: undefined }), "parent-run");
assert.equal(resolveSubagentStopReason({ aborted: true, reason: "(no reason)" }), "parent-run");
// An unrecognized caller label is not strong enough to claim the user did it either.
assert.equal(resolveSubagentStopReason({ aborted: true, reason: "some-other" }), "parent-run");

// --- notices are distinct and all recognized as "already noticed" ---

assert.equal(subagentStopNotice("user"), SUBAGENT_CANCELLED_NOTICE);
assert.equal(subagentStopNotice("parent-run"), SUBAGENT_PARENT_RUN_NOTICE);
assert.equal(subagentStopNotice("parent-stop"), SUBAGENT_PARENT_STOP_NOTICE);
assert.equal(subagentStopNotice("unknown"), SUBAGENT_ABORTED_NOTICE);
assert.equal(new Set(SUBAGENT_STOP_NOTICES).size, 4, "every reason has its own notice");

// --- the notice follows the reason, and still stacks onto partial output ---

assert.equal(applySubagentStopNotice("(no summary)", "parent-run"), SUBAGENT_PARENT_RUN_NOTICE);
assert.equal(applySubagentStopNotice("", "parent-stop"), SUBAGENT_PARENT_STOP_NOTICE);

const partialRun = applySubagentStopNotice("Found three of the eight gaps…", "parent-run");
assert.ok(partialRun.startsWith("Found three of the eight gaps…"), "partial work is preserved");
assert.ok(partialRun.includes(SUBAGENT_PARENT_RUN_NOTICE));
assert.ok(!partialRun.includes("cancelled by user"), "a discarded run does not claim the user did it");

// A second application must not stack a notice (any spelling counts as already noticed).
for (const notice of SUBAGENT_STOP_NOTICES) {
  assert.equal(applySubagentStopNotice(`text\n\n${notice}`, "parent-run"), `text\n\n${notice}`);
}

console.log("subagent-cancel-notice validation passed");
