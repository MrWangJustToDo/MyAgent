/**
 * Validates auto-compaction no-op guards:
 *
 * - Oversized-response boundary: a single huge LLM reply after a prior compact
 *   can leave fewer real user turns than keepRecentFlows. autoCompact must bail
 *   WITHOUT calling the summarizer.
 * - Trailing SUMMARY: after a successful compact the channel ends with a
 *   checkpoint. The next onConfig must not stack another SUMMARY just because
 *   window usage is 0 and estimateTokens(wire) is still over threshold.
 * - toSummarize is only previous SUMMARY messages (the compact-6 duplicate).
 *
 * Run: pnpm --filter @my-agent/core run validate:auto-compact-noop
 */
import assert from "node:assert/strict";

import {
  autoCompact,
  createCompactionSummaryUIMessage,
  findCutPoint,
  formatCompactionSummaryContent,
  formatContextSectionUserContent,
  isLatestDurableMessageCompactionSummary,
} from "../dist/dev.mjs";

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
const controlCut = findCutPoint(scenarioC, 2, 0);
assert.ok(controlCut > 1, `C: control history should cut past the summary (got ${controlCut})`);
assert.ok(scenarioC.slice(1, controlCut).length > 0, "C: toSummarize must be non-empty for a rich history");
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

function uiUser(text) {
  return { id: "u", role: "user", parts: [{ type: "text", content: text }] };
}

function uiTurnContext() {
  return {
    id: "tc",
    role: "user",
    parts: [
      {
        type: "text",
        content: formatContextSectionUserContent({
          key: "current_date",
          content: "<current_date>\nnow\n</current_date>",
        }),
      },
    ],
  };
}

// ============================================================================
// Scenario E: channel tail is already a SUMMARY (with optional trailing
// synthetic <ctx kind=...> message). Middleware must skip auto-compact — this is the stacked
// compact-5 + compact-6 failure mode.
// ============================================================================
assert.equal(
  isLatestDurableMessageCompactionSummary([uiUser("继续"), createCompactionSummaryUIMessage("checkpoint 5")]),
  true,
  "E: last durable message is SUMMARY"
);
assert.equal(
  isLatestDurableMessageCompactionSummary([
    uiUser("继续"),
    createCompactionSummaryUIMessage("checkpoint 5"),
    createCompactionSummaryUIMessage("checkpoint 6"),
  ]),
  true,
  "E: two stacked SUMMARYs still count as already compacted"
);
assert.equal(
  isLatestDurableMessageCompactionSummary([createCompactionSummaryUIMessage("checkpoint 5"), uiTurnContext()]),
  true,
  "E: trailing synthetic ctx message is ignored"
);
assert.equal(
  isLatestDurableMessageCompactionSummary([
    createCompactionSummaryUIMessage("checkpoint 5"),
    uiUser("继续"),
    uiTurnContext(),
  ]),
  false,
  "E: a new user turn after SUMMARY must allow compact"
);
assert.equal(isLatestDurableMessageCompactionSummary([]), false, "E: empty channel");
console.log("scenario E (latest durable is SUMMARY) -> skip-trigger OK");

// ============================================================================
// Scenario F: summary-first wire whose toSummarize is only a previous SUMMARY
// (compact-6: cutIndex 1, archive starts with [CONVERSATION SUMMARY]).
// Must no-op without calling the summarizer.
// ============================================================================
const scenarioF = [
  summaryMessage("checkpoint 5"),
  summaryMessage("checkpoint 5 almost identical"),
  userMessage("都提交并推送"),
  assistantMessage("ok"),
  userMessage("继续"),
  assistantMessage("working"),
];

const cutF = findCutPoint(scenarioF, 2, 0);
assert.equal(cutF, 2, `F: cut should land on the first real user (got ${cutF})`);
assert.equal(scenarioF.slice(1, cutF).length, 1, "F: toSummarize is the leftover SUMMARY");
assert.ok(
  scenarioF.slice(1, cutF).every((m) => typeof m.content === "string" && m.content.includes("[CONVERSATION SUMMARY]")),
  "F: toSummarize must be summary-only"
);

const resultF = await autoCompact(scenarioF, { keepRecentFlows: 2 }, "agent-f", throwingManager);
assert.equal(resultF.compacted, false, "F: summary-only toSummarize must not compact");
assert.equal(resultF.summary, undefined, "F: no summary should be produced");
console.log("scenario F (toSummarize is previous SUMMARY) -> no-op OK");

// ============================================================================
// Scenario G (token-budget fix): the SAME oversized single-turn shape as D,
// but with a token-budget keep policy. The budget walk cuts INSIDE the turn
// (split turn), so the empty-toSummarize guard must NOT trip — compaction
// proceeds to the summarizer (which fails on the throwing manager, proving it
// was reached) instead of silently no-oping.
// ============================================================================
const scenarioG = [
  summaryMessage("Prior summary."),
  userMessage("Only turn — but a huge one."),
  ...Array.from({ length: 4 }, (_, i) => assistantMessage(`step ${i}: ${"s".repeat(20_000)}`)),
];

const resultG = await autoCompact(
  scenarioG,
  { keepRecentTokens: 8_000 },
  "agent-g",
  throwingManager /* getAgent throws → summarizer fails */
);
assert.equal(resultG.error !== undefined, true, "G: must reach the summarizer, not short-circuit as a no-op");
assert.equal(resultG.compacted, false, "G: summarizer failure still reports compacted:false");
assert.match(resultG.error ?? "", /Compaction failed/, "G: error comes from the attempted summary call");

// Control: identical input WITHOUT a budget falls back to legacy turns policy
// and keeps the old no-op behavior.
const resultGLegacy = await autoCompact(scenarioG, { keepRecentFlows: 1 }, "agent-g-legacy", throwingManager);
assert.equal(resultGLegacy.compacted, false, "G-legacy: without budget the legacy guard still applies");
assert.equal(resultGLegacy.error, undefined, "G-legacy: silent no-op, summarizer never called");
console.log("scenario G (split-turn via token budget reaches summarizer; legacy still no-ops) OK");

console.log("\nvalidate:auto-compact-noop passed");
