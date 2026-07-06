import { generateId } from "../utils.js";

import { calculateCost } from "./types.js";

import type { TokenUsage } from "./types.js";
import type { ModelCapability, ModelPricing } from "../../models/types.js";
import type { ToolSet } from "../loop/types.js";
import type { GenerateTextEndEvent, ModelMessage, TypedToolCall } from "ai";

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

  finishInfo: GenerateTextEndEvent<ToolSet> | null = null;

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
  // Token Usage
  // ============================================================================

  updateUsage(t: TokenUsage) {
    const prev = this.usage;

    // usage (current step): inputTokens/cacheRead/cacheWrite are REPLACED
    // (latest step value shows current context window fill).
    // outputTokens/reasoningTokens are ACCUMULATED across steps in a turn.
    this.usage = {
      inputTokens: t.inputTokens,
      outputTokens: prev.outputTokens + t.outputTokens,
      totalTokens: 0,
      cacheReadTokens: t.cacheReadTokens ?? 0,
      cacheWriteTokens: t.cacheWriteTokens ?? 0,
      reasoningTokens: (prev.reasoningTokens ?? 0) + (t.reasoningTokens ?? 0),
    };

    this.usage.totalTokens = this.usage.inputTokens + this.usage.outputTokens;

    // totalUsage: ALL fields are ACCUMULATED across the entire session
    // (survives compaction). This gives the true lifetime token consumption
    // for accurate cost calculation and reporting.
    this.totalUsage = {
      inputTokens: this.totalUsage.inputTokens + t.inputTokens,
      outputTokens: this.totalUsage.outputTokens + t.outputTokens,
      totalTokens: 0,
      cacheReadTokens: (this.totalUsage.cacheReadTokens ?? 0) + (t.cacheReadTokens ?? 0),
      cacheWriteTokens: (this.totalUsage.cacheWriteTokens ?? 0) + (t.cacheWriteTokens ?? 0),
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

    if (this.pricing) {
      this.totalCost += calculateCost(t, this.pricing);
    }
  }

  updateFinal(t: GenerateTextEndEvent<ToolSet>) {
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

  // ============================================================================
  // Tool Call History (Task UI reads via getToolCallHistory)
  // ============================================================================

  recordToolCall(tool: TypedToolCall<NoInfer<ToolSet>>): void {
    this.tools.push(tool);
  }

  getToolCallHistory() {
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
   *
   * - No compaction yet (summaryMessage === null): returns all messages.
   * - After compaction: returns [summaryMessage, ...messages.slice(compactIndex)].
   *
   * `compactIndex` is an absolute index into `messages` marking where the
   * summarized content ends. Everything from `compactIndex` onward is the
   * live, unsummarized tail. We slice directly at compactIndex without
   * any adjustment — the cut point is always a user message boundary.
   *
   * Dynamic per-turn context (memories, todo nag) is injected by the caller
   * AFTER this method returns, so it never participates in compaction.
   */
  getMessagesForLLM(): ModelMessage[] {
    if (this.summaryMessage) {
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

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Clear everything
   */
  reset(): void {
    this.tools = [];
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
    this.touch();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
