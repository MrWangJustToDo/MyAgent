// ============================================================================
// Token Usage
// ============================================================================

import type { ModelPricing } from "../models/types.js";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/**
 * Calculate the cost of a token usage entry given pricing info.
 * Accounts for cache read/write tokens billed at their own rates.
 * Returns cost in USD.
 */
export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const normalInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);

  const inputCost = normalInput * pricing.inputPerM;
  const cacheReadCost = cacheRead * (pricing.cacheReadPerM ?? pricing.inputPerM);
  const cacheWriteCost = cacheWrite * (pricing.cacheWritePerM ?? pricing.inputPerM);
  const outputCost = usage.outputTokens * pricing.outputPerM;

  return (inputCost + cacheReadCost + cacheWriteCost + outputCost) / 1_000_000;
}

/**
 * Map TanStack usage from `@tanstack/ai` RUN_FINISHED to core TokenUsage.
 */
export function extractTanStackUsage(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: { cachedTokens?: number };
  completionTokensDetails?: { reasoningTokens?: number };
}): TokenUsage {
  const input = usage.promptTokens ?? 0;
  const output = usage.completionTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: usage.totalTokens ?? input + output,
    cacheReadTokens: usage.promptTokensDetails?.cachedTokens ?? undefined,
    reasoningTokens: usage.completionTokensDetails?.reasoningTokens ?? undefined,
  };
}
