import { generateId } from "../utils.js";

import type { ModelMessage } from "@tanstack/ai";

export const generateContextId = (): string => generateId("ctx");

/**
 * Conversation state for an agent: messages and compaction cut points.
 *
 * Token usage and pricing live on {@link UsageTracker} via {@link ManagedAgent.usage}.
 */
export class AgentContext {
  readonly id: string;
  readonly symbol = Symbol.for("agent-context");

  private messages: ModelMessage[] = [];
  private summaryMessage: ModelMessage | null = null;
  private compactIndex = 0;

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

  setMessages(m: ModelMessage[]): void {
    this.messages = m;
    this.touch();
  }

  getMessages(): ModelMessage[] {
    return this.messages;
  }

  /**
   * Messages sent to the LLM after compaction summary is applied.
   * Dynamic per-turn context is injected by the caller after this returns.
   */
  getMessagesForLLM(): ModelMessage[] {
    if (this.summaryMessage) {
      return [this.summaryMessage, ...this.messages.slice(this.compactIndex)];
    }
    return this.messages;
  }

  setSummaryMessage(m: ModelMessage | null): void {
    this.summaryMessage = m;
    this.touch();
  }

  getSummaryMessage(): ModelMessage | null {
    return this.summaryMessage;
  }

  setCompactIndex(index: number): void {
    this.compactIndex = index;
    this.touch();
  }

  getCompactIndex(): number {
    return this.compactIndex;
  }

  reset(): void {
    this.messages = [];
    this.summaryMessage = null;
    this.compactIndex = 0;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
