/**
 * Validates token-budget keep policy: cut-point selection, pairing-safe
 * boundaries, split-turn detection, wire projection consistency, and the
 * legacy turn-count fallback.
 *
 * Requires a prior package build (`pnpm run build`) so imports resolve from `dist/dev.mjs`.
 *
 * Run: pnpm --filter @my-agent/core run validate:compaction-keep-policy
 */

import { convertMessagesToModelMessages } from "@tanstack/ai";
import assert from "node:assert/strict";

import {
  deriveKeepRecentTokens,
  findCutPoint,
  findCutPointByBudget,
  getModelVisibleMessages,
  keepPolicyProjectionOptions,
  resolveAutoCompactTrigger,
  resolveKeepPolicy,
  createCompactionSummaryUIMessage,
} from "../dist/dev.mjs";

// ============================================================================
// Helpers — build TanStack model messages with realistic sizes
// ============================================================================

let seq = 0;
const text = (t) => ({ type: "text", content: t });
const user = (t) => ({ role: "user", id: `u${seq++}`, content: t });
const assistant = (t, toolCalls) => ({
  role: "assistant",
  id: `a${seq++}`,
  content: [text(t)],
  ...(toolCalls ? { toolCalls } : {}),
});
const toolMsg = (id, output) => ({
  role: "tool",
  toolCallId: id,
  content: [{ type: "text", content: `result:${output}` }],
});
const toolCall = (id, name = "run_command") => ({
  id,
  type: "function",
  function: { name, arguments: "{}" },
});

/** Rough token estimate mirroring chars/4 for assertions. */
const tokensOf = (messages) =>
  messages.reduce((acc, m) => {
    const parts = typeof m.content === "string" ? [text(m.content)] : (m.content ?? []);
    const chars =
      (parts ?? []).reduce((n, p) => n + (p?.type === "text" ? p.content.length : 0), 0) +
      (m.toolCalls ?? []).reduce((n, tc) => n + tc.function.arguments.length + tc.function.name.length, 0);
    return acc + Math.ceil(chars / 4);
  }, 0);

// ============================================================================
// resolveKeepPolicy
// ============================================================================

// Explicit budget wins.
assert.deepEqual(resolveKeepPolicy({ keepRecentTokens: 10_000 }, 200_000), {
  kind: "tokens",
  keepRecentTokens: 10_000,
});

// Derived from context window when unset.
{
  const policy = resolveKeepPolicy({}, 128_000);
  assert.equal(policy.kind, "tokens");
  // min((128k - 16.4k) * 0.25, 32k) ≈ 27.9k
  assert.equal(policy.keepRecentTokens, deriveKeepRecentTokens(128_000));
  assert.ok(policy.keepRecentTokens > 20_000 && policy.keepRecentTokens <= 32_000);
}

// Small windows clamp to a usable minimum.
assert.ok(deriveKeepRecentTokens(8_000) >= 4_000);

// Legacy fallback without a context window.
assert.deepEqual(resolveKeepPolicy({ keepRecentFlows: 3 }), { kind: "turns", keepRecentFlows: 3 });
assert.deepEqual(resolveKeepPolicy({}), { kind: "turns", keepRecentFlows: 2 });

// Projection options payload.
assert.deepEqual(keepPolicyProjectionOptions({ kind: "tokens", keepRecentTokens: 5_000 }), {
  keepRecentTokens: 5_000,
});
assert.deepEqual(keepPolicyProjectionOptions({ kind: "turns", keepRecentFlows: 2 }), { keepRecentFlows: 2 });

// ============================================================================
// Window-relative trigger
// ============================================================================

// Reserve is clamped to 25% of the window: min(16384, 32k*0.25=8k) = 8k.
assert.deepEqual(resolveAutoCompactTrigger({ compactAtPercent: 80 }, 32_000), {
  triggerAt: Math.floor(((32_000 - 8_000) * 80) / 100),
  windowRelative: true,
});
// Tiny window: reserve clamps to a fraction — no constant-compaction collapse.
{
  const tiny = resolveAutoCompactTrigger({}, 8_000);
  assert.equal(tiny.windowRelative, true);
  // reserve = min(16384, 2000) = 2000 → (8000-2000)*0.8 = 4800
  assert.equal(tiny.triggerAt, 4_800);
}
// Legacy absolute path.
{
  const r = resolveAutoCompactTrigger({ tokenThreshold: 100_000, compactAtPercent: 50 });
  assert.equal(r.windowRelative, false);
  assert.equal(r.triggerAt, 50_000);
}

// ============================================================================
// Budget walk: single oversized turn still yields a cut (the core bug fix)
// ============================================================================

{
  const big = "x".repeat(40_000); // ~10k tokens per message
  // One turn: user + many assistant/tool exchanges. No second user turn exists.
  const messages = [
    user("please refactor everything"),
    ...Array.from({ length: 6 }, (_, i) => [
      assistant(`step ${i}`, [toolCall(`call-${i}`)]),
      toolMsg(`call-${i}`, big),
    ]).flat(),
    assistant("done"),
  ];

  // Legacy count-based policy cannot cut (needs 2 user turns).
  assert.equal(findCutPoint(messages, 2), 0);

  // Token-budget policy cuts inside the turn at an assistant boundary.
  const cut = findCutPointByBudget(messages, 24_000);
  assert.ok(cut.cutIndex > 1, `expected mid-turn cut, got ${cut.cutIndex}`);
  assert.equal(cut.isSplitTurn, true);
  assert.equal(cut.turnStartIndex, 0);

  // Cut boundary is never a tool result and never orphans pairs.
  const cutMessage = messages[cut.cutIndex];
  assert.notEqual(cutMessage.role, "tool");

  // Kept region tokens are bounded (within slack of the budget).
  assert.ok(tokensOf(messages.slice(cut.cutIndex)) <= 24_000 + 11_000);

  // Summarized side is non-empty → compaction makes progress.
  assert.ok(tokensOf(messages.slice(0, cut.cutIndex)) > 0);
}

// ============================================================================
// Pairing safety across random-ish budgets
// ============================================================================

{
  const messages = [];
  let callId = 0;
  for (let turn = 0; turn < 4; turn++) {
    messages.push(user(`task ${turn} — ${"y".repeat(5_000)}`));
    for (let i = 0; i < 3; i++) {
      messages.push(assistant(`working ${i}`, [toolCall(`c${callId}`)]));
      messages.push(toolMsg(`c${callId}`, "z".repeat(8_000)));
      callId++;
    }
    messages.push(assistant(`turn ${turn} complete`));
  }

  for (const budget of [4_000, 12_000, 30_000, 60_000]) {
    const cut = findCutPointByBudget(messages, budget);
    if (cut.cutIndex === 0) continue;
    const kept = messages.slice(cut.cutIndex);
    // Every kept tool result has its call in the kept region.
    const keptCallIds = new Set(kept.flatMap((m) => (m.toolCalls ?? []).map((tc) => tc.id)));
    for (const m of kept) {
      if (m.role === "tool") {
        assert.ok(keptCallIds.has(m.toolCallId), `orphaned tool result at budget ${budget}`);
      }
    }
    // Never cut on a tool message.
    assert.notEqual(kept[0].role, "tool");
  }
}

// ============================================================================
// Wire projection: deterministic recovery with token budget
// ============================================================================

{
  const history = [
    user("old task"),
    assistant("working", [toolCall("old-call")]),
    toolMsg("old-call", "w".repeat(9_000)),
  ];
  const after = [user("new task"), assistant("ok")];
  const summaryUIMessage = createCompactionSummaryUIMessage("SUMMARY BODY\n[END SUMMARY]");
  const chronologic = convertMessagesToModelMessages([...history, summaryUIMessage, ...after]);

  const opts = keepPolicyProjectionOptions(resolveKeepPolicy({ keepRecentTokens: 1_000 }, undefined));
  const wireA = getModelVisibleMessages(chronologic, opts);
  const wireB = getModelVisibleMessages(chronologic, opts);
  assert.deepEqual(wireA, wireB, "projection must be deterministic over frozen input");

  // Summary first, kept slice follows, newer messages last.
  assert.equal(wireA[0].role, "user");
  assert.ok(JSON.stringify(wireA[0]).includes("SUMMARY BODY"));
  assert.equal(wireA[wireA.length - 1].role, "assistant");

  // Token-budget projection keeps less than legacy-2-turns would here.
  const legacyWire = getModelVisibleMessages(chronologic, { keepRecentFlows: 2 });
  assert.ok(wireA.length <= legacyWire.length);
}

console.log("compaction-keep-policy validation passed");
