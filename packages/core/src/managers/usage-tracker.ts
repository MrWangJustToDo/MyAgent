import { calculateCost, type TokenUsage } from "./usage-tracker-utils.js";

import type { ModelCapability, ModelPricing } from "../models/types.js";

// ============================================================================
// UsageTracker
// ============================================================================

const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
});

export interface UsageSnapshot {
  usage: TokenUsage;
  costUsd?: number;
}

/**
 * Tracks per-step context window fill and lifetime token usage for a managed agent.
 */
export class UsageTracker {
  /** Current context window fill (input replaced each step; output accumulated per turn). */
  private window: TokenUsage = emptyUsage();

  /** Lifetime totals across compaction cycles. */
  private total: TokenUsage = emptyUsage();

  private totalCostUsd = 0;
  private pricing: ModelPricing | null = null;
  private capabilities: ModelCapability[] = [];
  private tokenLimit = 0;

  /** Update window usage from a main run step and accumulate into lifetime totals. */
  updateWindowUsage(usage: TokenUsage, pricing?: ModelPricing | null): void {
    const prev = this.window;
    const resolvedPricing = pricing ?? this.pricing;

    this.window = {
      inputTokens: usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      totalTokens: 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      reasoningTokens: (prev.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
    };
    this.window.totalTokens = this.window.inputTokens + this.window.outputTokens;

    this.accumulateTotal(usage, resolvedPricing);
  }

  /** Add usage to lifetime totals only (side queries, title generation, etc.). */
  addTotal(usage: TokenUsage, pricing?: ModelPricing | null): void {
    this.accumulateTotal(usage, pricing ?? this.pricing);
  }

  private accumulateTotal(usage: TokenUsage, pricing: ModelPricing | null | undefined): void {
    this.total = {
      inputTokens: this.total.inputTokens + usage.inputTokens,
      outputTokens: this.total.outputTokens + usage.outputTokens,
      totalTokens: 0,
      cacheReadTokens: (this.total.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: (this.total.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
      reasoningTokens: (this.total.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
    };
    this.total.totalTokens = this.total.inputTokens + this.total.outputTokens;

    if (pricing) {
      this.totalCostUsd += calculateCost(usage, pricing);
    }
  }

  getWindowUsage(): Readonly<TokenUsage> {
    return this.window;
  }

  getTotal(): Readonly<TokenUsage> {
    return this.total;
  }

  getTotalCostUsd(): number {
    return this.totalCostUsd;
  }

  setTotalCostUsd(cost: number): void {
    this.totalCostUsd = cost;
  }

  setPricing(pricing: ModelPricing): void {
    this.pricing = pricing;
  }

  getPricing(): ModelPricing | null {
    return this.pricing;
  }

  setCapabilities(caps: ModelCapability[]): void {
    this.capabilities = caps;
  }

  hasCapability(cap: ModelCapability): boolean {
    if (this.capabilities.length === 0) return true;
    return this.capabilities.includes(cap);
  }

  setTokenLimit(limit: number): void {
    this.tokenLimit = limit;
  }

  getTokenLimit(): number {
    return this.tokenLimit;
  }

  getTokenLimitPercent(): number {
    if (this.tokenLimit <= 0) return 0;
    return Math.min(100, (this.window.inputTokens / this.tokenLimit) * 100);
  }

  resetWindow(): void {
    this.window = emptyUsage();
  }

  reset(): void {
    this.window = emptyUsage();
    this.total = emptyUsage();
    this.totalCostUsd = 0;
  }

  snapshot(pricing?: ModelPricing | null): UsageSnapshot {
    return {
      usage: { ...this.total },
      ...(pricing ? { costUsd: this.totalCostUsd || calculateCost(this.total, pricing) } : {}),
    };
  }
}

/**
 * Map TanStack {@link TokenUsage} from `@tanstack/ai` RUN_FINISHED to core TokenUsage.
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
