import type { AGUIEvent, FinishInfo } from "@tanstack/ai";

// ============================================================================
// Token Usage
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// AgentContext ID Generator
// ============================================================================

export const generateContextId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ctx_${timestamp}_${random}`;
};

// ============================================================================
// AgentContext Class
// ============================================================================

export class AgentContext {
  readonly id: string;

  readonly symbol = Symbol.for("agent-context");

  /** Stream events (for UI rendering) */
  private events: AGUIEvent[] = [];

  /** Token usage */
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  /** Event listeners */
  private eventListeners: Set<(event: AGUIEvent) => void> = new Set();

  finishInfo: FinishInfo | null = null;

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
  emit(event: AGUIEvent): void {
    this.events.push(event);

    // Update streaming state
    if (event.type === "RUN_STARTED") {
      this.isStreaming = true;
    } else if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") {
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
  onEvent(listener: (event: AGUIEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Get all events (for replay/debugging)
   */
  getEvents(): AGUIEvent[] {
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

  updateFinal(t: FinishInfo) {
    this.finishInfo = t;
  }

  getUsage(): TokenUsage {
    return this.usage;
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
