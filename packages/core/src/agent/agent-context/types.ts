import type { ModelPricing } from "../../models/types.js";

// ============================================================================
// Token Usage
// ============================================================================

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
 * Extract TokenUsage from a Vercel AI SDK LanguageModelUsage object.
 * Works with the `usage` field from generateText/streamText results and onStepFinish.
 */
export function extractTokenUsage(sdkUsage: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  inputTokenDetails?: { cacheReadTokens?: number | null; cacheWriteTokens?: number | null };
  outputTokenDetails?: { reasoningTokens?: number | null };
}): TokenUsage {
  const input = sdkUsage.inputTokens ?? 0;
  const output = sdkUsage.outputTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: sdkUsage.totalTokens ?? input + output,
    cacheReadTokens: sdkUsage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: sdkUsage.inputTokenDetails?.cacheWriteTokens ?? 0,
    reasoningTokens: sdkUsage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}
