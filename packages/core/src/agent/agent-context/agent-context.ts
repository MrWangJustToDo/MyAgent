// ============================================================================
// Token Usage
// ============================================================================

import { generateId } from "../../base/utils.js";

import type { ModelCapability, ModelPricing } from "../../models/types.js";
import type { StreamPart, ToolSet } from "../loop/Agent.js";
import type { ModelMessage, OnFinishEvent, TypedToolCall } from "ai";

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

// ============================================================================
// AgentContext ID Generator
// ============================================================================

export const generateContextId = (): string => generateId("ctx");

// ============================================================================
// AgentContext Class
// ============================================================================

export class AgentContext {
  readonly id: string;

  readonly symbol = Symbol.for("agent-context");

  /** Stream events (for UI rendering) */
  // current emit the raw vercel type
  // SEE https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/core/src/events.ts ag-ui protocol
  /**
   * @internal
   */
  private events: StreamPart[] = [];

  private messages: ModelMessage[] = [];

  /** The compaction summary message (null if never compacted) */
  private summaryMessage: ModelMessage | null = null;

  private messagesForLLM: ModelMessage[] = [];

  /** Index in messages where the last compaction cut happened (0 = no compaction) */
  private compactIndex = 0;

  private tools: TypedToolCall<NoInfer<ToolSet>>[] = [];

  /** Token usage (resets on compaction) */
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  /** Lifetime token usage (never resets, survives compaction) */
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  /** Model pricing (set from ModelInfo, null if unknown) */
  private pricing: ModelPricing | null = null;

  /** Model capabilities (set from ModelInfo) */
  private capabilities: ModelCapability[] = [];

  /** Session cost in USD (lifetime, never resets) */
  private totalCost = 0;

  /** Token limit (from compaction config threshold) */
  private tokenLimit = 0;

  /** Event listeners */
  private eventListeners: Set<(event: StreamPart) => void> = new Set();

  finishInfo: OnFinishEvent<ToolSet> | null = null;

  /** Streaming state */
  isStreaming = false;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;

  constructor({ id, setUp }: { id?: string; setUp?: (t: AgentContext) => AgentContext }) {
    this.id = id ?? generateContextId();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    if (setUp) {
      return setUp(this);
    }
  }

  // ============================================================================
  // Stream Event Handling
  // ============================================================================

  /**
   * Emit a stream event
   */
  emit(event: StreamPart): void {
    this.events.push(event);

    // Update streaming state
    if (event.type === "start") {
      this.isStreaming = true;
    } else if (event.type === "finish" || event.type === "error") {
      this.isStreaming = false;
    }

    // Notify listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }

    this.touch();
  }

  /**
   * Subscribe to stream events
   */
  onEvent(listener: (event: StreamPart) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Get all events (for replay/debugging)
   */
  getEvents(): StreamPart[] {
    return [...this.events];
  }

  updateUsage(t: TokenUsage) {
    const prev = this.usage;

    // inputTokens is REPLACED (not accumulated) — each step sends the full
    // context so the latest value represents current context window fill.
    // cacheRead/Write are detail breakdowns of inputTokens, so they follow
    // the same replacement pattern.
    // outputTokens is ACCUMULATED — each step generates new output.
    // reasoningTokens is a subset of output, so it accumulates too.
    this.usage = {
      inputTokens: t.inputTokens,
      outputTokens: prev.outputTokens + t.outputTokens,
      totalTokens: 0,
      cacheReadTokens: t.cacheReadTokens ?? 0,
      cacheWriteTokens: t.cacheWriteTokens ?? 0,
      reasoningTokens: (prev.reasoningTokens ?? 0) + (t.reasoningTokens ?? 0),
    };

    this.usage.totalTokens = this.usage.inputTokens + this.usage.outputTokens;

    // totalUsage: inputTokens uses replacement-with-carry (survives compaction
    // resets). Cache details follow the same pattern. Output fields accumulate.
    const prevTotalInput = this.totalUsage.inputTokens - prev.inputTokens;
    const prevTotalCacheRead = (this.totalUsage.cacheReadTokens ?? 0) - (prev.cacheReadTokens ?? 0);
    const prevTotalCacheWrite = (this.totalUsage.cacheWriteTokens ?? 0) - (prev.cacheWriteTokens ?? 0);

    this.totalUsage = {
      inputTokens: prevTotalInput + t.inputTokens,
      outputTokens: this.totalUsage.outputTokens + t.outputTokens,
      totalTokens: 0,
      cacheReadTokens: prevTotalCacheRead + (t.cacheReadTokens ?? 0),
      cacheWriteTokens: prevTotalCacheWrite + (t.cacheWriteTokens ?? 0),
      reasoningTokens: (this.totalUsage.reasoningTokens ?? 0) + (t.reasoningTokens ?? 0),
    };

    this.totalUsage.totalTokens = this.totalUsage.inputTokens + this.totalUsage.outputTokens;

    if (this.pricing) {
      this.totalCost += calculateCost(t, this.pricing);
    }
  }

  addTotalUsage(t: TokenUsage) {
    this.totalUsage = {
      inputTokens: this.totalUsage.inputTokens + t.inputTokens,
      outputTokens: this.totalUsage.outputTokens + t.outputTokens,
      totalTokens: this.totalUsage.totalTokens + t.totalTokens,
      cacheReadTokens: (this.totalUsage.cacheReadTokens ?? 0) + (t.cacheReadTokens ?? 0),
      cacheWriteTokens: (this.totalUsage.cacheWriteTokens ?? 0) + (t.cacheWriteTokens ?? 0),
      reasoningTokens: (this.totalUsage.reasoningTokens ?? 0) + (t.reasoningTokens ?? 0),
    };
  }

  updateFinal(t: OnFinishEvent<ToolSet>) {
    this.finishInfo = t;
  }

  getUsage(): TokenUsage {
    return this.usage;
  }

  /** Lifetime usage across all compaction cycles */
  getTotalUsage(): TokenUsage {
    return this.totalUsage;
  }

  /**
   * Set model pricing for cost tracking.
   */
  setPricing(pricing: ModelPricing): void {
    this.pricing = pricing;
  }

  /**
   * Get the current model pricing.
   */
  getPricing(): ModelPricing | null {
    return this.pricing;
  }

  /**
   * Get lifetime session cost in USD.
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Set lifetime session cost (for restoring from saved sessions).
   */
  setTotalCost(cost: number): void {
    this.totalCost = cost;
  }

  /**
   * Set model capabilities (from ModelInfo.capabilities).
   */
  setCapabilities(caps: ModelCapability[]): void {
    this.capabilities = caps;
  }

  /**
   * Check if the model has a specific capability.
   * Returns true if capabilities haven't been set (optimistic default).
   */
  hasCapability(cap: ModelCapability): boolean {
    if (this.capabilities.length === 0) return true;
    return this.capabilities.includes(cap);
  }

  setTokenLimit(limit: number): void {
    this.tokenLimit = limit;
    this.touch();
  }

  getTokenLimit(): number {
    return this.tokenLimit;
  }

  /**
   * Current token usage as a percentage of the token limit (0–100).
   * Returns 0 if no limit is set.
   */
  getTokenLimitPercent(): number {
    if (this.tokenLimit <= 0) return 0;
    return Math.min(100, (this.usage.inputTokens / this.tokenLimit) * 100);
  }

  addTool(tool: TypedToolCall<NoInfer<ToolSet>>) {
    this.tools.push(tool);
  }

  getTools() {
    return this.tools;
  }

  setMessages(m: ModelMessage[]) {
    this.messages = m;
  }

  getMessages() {
    return this.messages;
  }

  /**
   * Get messages to send to the LLM.
   * Returns [summaryMessage, ...messages.slice(compactIndex)] if compacted,
   * or all messages if no compaction has occurred.
   */
  getMessagesForLLM(): ModelMessage[] {
    if (this.summaryMessage) {
      // Walk compactIndex back to ensure we start on an assistant message
      while (this.compactIndex > 0 && this.messages[this.compactIndex]?.role !== "assistant") {
        this.compactIndex--;
      }
      const list = this.messages.slice(this.compactIndex);
      const finalList = [this.summaryMessage, ...list];
      this.messagesForLLM = finalList;
      return finalList;
    }
    this.messagesForLLM = this.messages;
    return this.messages;
  }

  setSummaryMessage(m: ModelMessage | null) {
    this.summaryMessage = m;
  }

  getSummaryMessage(): ModelMessage | null {
    return this.summaryMessage;
  }

  setCompactIndex(index: number) {
    this.compactIndex = index;
  }

  getCompactIndex(): number {
    return this.compactIndex;
  }

  /**
   * Reset token usage counters (e.g., after compaction)
   */
  resetUsage(): void {
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };
    this.touch();
  }

  /**
   * Clear tool call history (e.g., after compaction when old tool calls are no longer relevant)
   */
  clearTools(): void {
    this.tools = [];
    this.touch();
  }

  /**
   * Clear events (keep messages)
   */
  clearEvents(): void {
    this.events = [];
    this.touch();
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Clear everything
   */
  reset(): void {
    this.tools = [];
    this.events = [];
    this.messages = [];
    this.summaryMessage = null;
    this.compactIndex = 0;
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };
    this.totalCost = 0;
    this.finishInfo = null;
    this.isStreaming = false;
    this.touch();
  }

  /**
   * Start a new turn (clear events, keep messages)
   */
  startNewTurn(): void {
    this.events = [];
    this.isStreaming = false;
    this.touch();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
