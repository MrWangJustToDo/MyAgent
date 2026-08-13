/**
 * Validates auto-compaction no-op guard for the oversized-response boundary.
 *
 * When a single oversized LLM response fills the window right after a prior
 * compact ([summary, user, llm, user, llm, ...]) there may be fewer real user
 * turns than keepRecentFlows. autoCompact must bail out WITHOUT calling the
 * summarizer (no wasted LLM call, no meaningless checkpoint), even though the
 * token threshold is exceeded.
 *
 * Run: pnpm --filter @my-agent/core run validate:auto-compact-noop
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { autoCompact, formatCompactionSummaryContent } from "../dist/dev.mjs";

/** Manager whose methods throw — proves the short-circuit never touches it. */
const throwingManager = {
  getAgent: () => {
    throw new Error("manager.getAgent must not be called for a no-op compact");
  },
};

function summaryMessage(summary) {
  return { role: "user", content: formatCompactionSummaryContent(summary) };
}

function userMessage(text) {
  return { role: "user", content: text };
}

function assistantMessage(text) {
  return { role: "assistant", content: text };
}

// ============================================================================
// Scenario A (the bug): [summary, user, llm, user, llm, llm] — only 2 real user
// turns, but the trailing assistant message is huge and the threshold is met.
// llmCutIndex lands at the 2nd user (index 1) → toSummarize is empty. Must
// short-circuit as compacted:false without calling the manager/summarizer.
// ============================================================================
const scenarioA = [
  summaryMessage("Prior conversation summarized here."),
  userMessage("First real instruction."),
  assistantMessage("First reply."),
  userMessage("Second instruction."),
  assistantMessage("Huge reply ".repeat(50_000)), // oversized single response
];

const resultA = await autoCompact(scenarioA, { keepRecentFlows: 2 }, "agent-a", throwingManager);
assert.equal(resultA.compacted, false, "A: empty toSummarize must not compact");
assert.equal(resultA.summary, undefined, "A: no summary should be produced");
assert.equal(resultA.cutIndex, undefined, "A: no cutIndex for a no-op");
assert.equal(resultA.tokensAfter, resultA.tokensBefore, "A: tokens must be unchanged");
console.log("scenario A (summary + 2 turns, oversized tail) -> no-op OK");

// ============================================================================
// Scenario B: no summary prefix, exactly keepRecentFlows user turns.
// [user, llm, user, llm] with keepRecentFlows=2 → llmCutIndex=0 → early no-op.
// ============================================================================
const scenarioB = [
  userMessage("First instruction."),
  assistantMessage("First reply."),
  userMessage("Second instruction."),
  assistantMessage("Huge reply ".repeat(50_000)),
];

const resultB = await autoCompact(scenarioB, { keepRecentFlows: 2 }, "agent-b", throwingManager);
assert.equal(resultB.compacted, false, "B: llmCutIndex===0 must not compact");
console.log("scenario B (no summary, exactly 2 turns) -> no-op OK");

// ============================================================================
// Scenario C (control): plenty of older turns → normal compaction path runs and
// calls the summarizer (manager.getAgent used). We use a manager whose
// getAgent returns null so compaction proceeds and archives are skipped.
// ============================================================================
const scenarioC = [
  summaryMessage("Prior summary."),
  userMessage("Turn 1"),
  assistantMessage("Reply 1"),
  userMessage("Turn 2"),
  assistantMessage("Reply 2"),
  userMessage("Turn 3"),
  assistantMessage("Reply 3"),
  userMessage("Turn 4"),
  assistantMessage("Reply 4"),
  userMessage("Turn 5"),
  assistantMessage("Reply 5"),
  userMessage("Turn 6"),
  assistantMessage("Reply 6"),
];

// Need a working manager so the summarizer subagent path can run.
// Import a real AgentManager shim is heavy; instead assert that a normal path
// with a non-empty toSummarize does NOT short-circuit early by checking it
// reaches summarizeConversation. We can't easily run a real LLM here, so use a
// manager that stubs the pieces autoCompact touches after the cut: getAgent.
// summarizeConversation will run a subagent and fail without a real manager —
// so this control simply proves the guard is NOT tripped by a rich history:
// use findCutPoint directly for the boundary math instead.
import { findCutPoint } from "../dist/dev.mjs";

const controlCut = findCutPoint(scenarioC, 2, 0);
assert.ok(controlCut > 1, `C: control history should cut past the summary (got ${controlCut})`);
assert.ok(
  scenarioC.slice(1, controlCut).length > 0,
  "C: toSummarize must be non-empty for a rich history"
);
console.log(`scenario C (rich history) -> cut at ${controlCut}, toSummarize non-empty OK`);

// ============================================================================
// Scenario D: summary + exactly one real user turn (keepRecentFlows=1) — also
// an empty toSummarize no-op (llmCutIndex=1, summaryOffset=1).
// ============================================================================
const scenarioD = [
  summaryMessage("Prior summary."),
  userMessage("Only turn."),
  assistantMessage("Huge reply ".repeat(50_000)),
];

const resultD = await autoCompact(scenarioD, { keepRecentFlows: 1 }, "agent-d", throwingManager);
assert.equal(resultD.compacted, false, "D: single turn with summary must not compact");
console.log("scenario D (summary + 1 turn) -> no-op OK");

console.log("\nvalidate:auto-compact-noop passed");
