// ============================================================================
// Token Usage
// ============================================================================

import { generateId } from "../../base/utils.js";

import type { StreamPart, ToolSet } from "../loop/agent.js";
import type { OnFinishEvent, TypedToolCall } from "ai";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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

  private tools: TypedToolCall<NoInfer<ToolSet>>[] = [];

  /** Token usage */
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

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

    this.usage = {
      inputTokens: prev.inputTokens + t.inputTokens,
      outputTokens: prev.outputTokens + t.outputTokens,
      totalTokens: prev.totalTokens + t.totalTokens,
    };
  }

  updateFinal(t: OnFinishEvent<ToolSet>) {
    this.finishInfo = t;
  }

  getUsage(): TokenUsage {
    return this.usage;
  }

  addTool(tool: TypedToolCall<NoInfer<ToolSet>>) {
    this.tools.push(tool);
  }

  getTools() {
    return this.tools;
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
    this.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
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
