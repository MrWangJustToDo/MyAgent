import { generateId } from "../utils.js";

import { calculateCost } from "./types.js";

import type { TokenUsage } from "./types.js";
import type { ModelCapability, ModelPricing } from "../../models/types.js";
import type { StreamPart, ToolSet } from "../loop/types.js";
import type { ModelMessage, OnFinishEvent, TypedToolCall } from "ai";

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

  private toolListeners: Set<(event: TypedToolCall<ToolSet>) => void> = new Set();

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
  emitStream(event: StreamPart): void {
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
  onStream(listener: (event: StreamPart) => void): () => void {
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

  emitTool(tool: TypedToolCall<NoInfer<ToolSet>>) {
    this.tools.push(tool);
    for (const listener of this.toolListeners) {
      try {
        listener(tool);
      } catch {
        // Ignore listener errors
      }
    }
  }

  onTool(listener: (event: TypedToolCall<ToolSet>) => void) {
    this.toolListeners.add(listener);
    return () => this.toolListeners.delete(listener);
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
