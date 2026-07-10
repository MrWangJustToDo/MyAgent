// ============================================================================
// Token Usage
// ============================================================================

import type { ModelPricing } from "../models/types";

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
