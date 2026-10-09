/**
 * Regression gate: `calculateCost` must resolve the cache convention the same way
 * `promptTokensOf` does.
 *
 * The module already knew `inputTokens` means two different things — `promptTokensOf` reads
 * `cache > inputTokens` as "the counters are disjoint, the prompt is the sum", and calls the
 * other case inclusive. `calculateCost` beside it did not: it subtracted the cache counters
 * from `inputTokens` unconditionally,
 *
 *     const normalInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
 *
 * so on an exclusive sample the subtraction clamps the *fresh* input to zero and bills it at
 * nothing. A real row from this workspace's log —
 *
 *     { inputTokens: 307, outputTokens: 213_813, cacheReadTokens: 337_920 }
 *
 * — is billed $0.277520 instead of $0.277598 (the 307-token error is 0.03% of that call, so
 * this is not a revenue-sized bug). It is a *consistency* bug worth a guard: two readings of
 * one `TokenUsage` in one module, and the cost one was the stricter-inclusive half while the
 * token one was convention-aware. Any inclusive-only assumption also silently swallows the
 * uncached share of every fully-cached prompt, which is most of them.
 *
 * Run: pnpm --filter @codent/core run validate:cost-convention
 */

import assert from "node:assert/strict";

import { UsageTracker, promptTokensOf } from "../dist/dev.mjs";

// The rates are the fixture's, not a claim about a vendor's price list — the assertions are
// about which *share* each rate is applied to, so any distinct set works.
const PRICING = { inputPerM: 0.255552, outputPerM: 1.27776, cacheReadPerM: 0.0127776 };

/** Cost of one reading with the cache counters disjoint from `inputTokens` (exclusive). */
const exclusiveCost = (usage) =>
  (usage.inputTokens * PRICING.inputPerM +
    (usage.cacheReadTokens ?? 0) * PRICING.cacheReadPerM +
    (usage.outputTokens ?? 0) * PRICING.outputPerM) /
  1_000_000;

function costVia(usage) {
  // The real code path (`addTotal` → `accumulateTotal` → `calculateCost`), not a copy of the
  // formula — otherwise this guard would pass while the shipped one drifted.
  const tracker = new UsageTracker();
  tracker.addTotal(usage, PRICING);
  return tracker.getTotalCostUsd();
}

const assertClose = (got, want, message) =>
  assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${message} — got ${got}, want ${want}`);

// ---------------------------------------------------------------------------
// 1. An exclusive sample bills its fresh input
// ---------------------------------------------------------------------------
{
  // The log row above. `inputTokens` here is the cache-*miss* part, so all 307 of it is
  // genuinely fresh and none of it may be subtracted.
  const exclusive = { inputTokens: 307, outputTokens: 213_813, totalTokens: 0, cacheReadTokens: 337_920 };

  assert.equal(
    promptTokensOf(exclusive),
    338_227,
    "control: the token rule already reads this sample as disjoint (307 + 337,920)"
  );

  const got = costVia(exclusive);
  assertClose(got, exclusiveCost(exclusive), "the fresh input of an exclusive sample must be billed at the input rate");

  // The regression, asserted directly: the old form bills only the cache + output.
  const clamped = (0 * PRICING.inputPerM + 337_920 * PRICING.cacheReadPerM + 213_813 * PRICING.outputPerM) / 1_000_000;
  assert.ok(Math.abs(got - clamped) > 1e-9, "control: the inclusive-only form really does drop the 307 fresh tokens");
  assertClose(
    clamped,
    (337_920 * PRICING.cacheReadPerM + 213_813 * PRICING.outputPerM) / 1_000_000,
    "control: the old code billed the cache read and the output, and nothing else"
  );
}

// ---------------------------------------------------------------------------
// 2. cache_write is disjoint the same way (it pools with cache_read)
// ---------------------------------------------------------------------------
{
  const usage = { inputTokens: 100, outputTokens: 0, totalTokens: 0, cacheWriteTokens: 90_000 };
  const want = (100 * PRICING.inputPerM + 90_000 * PRICING.inputPerM) / 1_000_000; // no write rate → input rate
  assertClose(costVia(usage), want, "a write-only cache must not subtract from inputTokens either");
}

// ---------------------------------------------------------------------------
// 3. An inclusive sample is unchanged (the cache counters really are a subset)
// ---------------------------------------------------------------------------
{
  // Here `inputTokens` is the whole prompt and the cache read sits inside it, so subtracting
  // is right and the fix must not start double-counting it.
  const inclusive = { inputTokens: 125_400, outputTokens: 1_000, totalTokens: 0, cacheReadTokens: 100_000 };
  assert.equal(promptTokensOf(inclusive), 125_400, "control: the token rule reads this sample as inclusive");

  const want =
    ((125_400 - 100_000) * PRICING.inputPerM + 100_000 * PRICING.cacheReadPerM + 1_000 * PRICING.outputPerM) /
    1_000_000;
  assertClose(costVia(inclusive), want, "an inclusive sample keeps subtracting the cached prefix");
}

// ---------------------------------------------------------------------------
// 4. The uncached share is never negative, and a missing cache counter is zero
// ---------------------------------------------------------------------------
{
  assertClose(costVia({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }), 0, "an empty reading costs nothing");
  // `cacheWriteTokens` alone exceeding `inputTokens` was the shape that clamped hardest.
  const both = { inputTokens: 10, outputTokens: 5, totalTokens: 0, cacheReadTokens: 4, cacheWriteTokens: 500 };
  const want =
    (10 * PRICING.inputPerM + 4 * PRICING.cacheReadPerM + 500 * PRICING.inputPerM + 5 * PRICING.outputPerM) / 1_000_000;
  assertClose(costVia(both), want, "pooled cache counters decide the convention together");
}

console.log("cost-convention validation passed");
