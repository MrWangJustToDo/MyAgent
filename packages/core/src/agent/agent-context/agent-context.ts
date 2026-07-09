import { convertMessagesToModelMessages } from "@tanstack/ai";

import { generateId } from "../utils.js";

import type { ModelMessage, UIMessage } from "@tanstack/ai";

export const generateContextId = (): string => generateId("ctx");

/**
 * Conversation state for an agent.
 *
 * - {@link UIMessage} history is the client-facing source of truth (approvals, tool parts).
 * - {@link ModelMessage} view is derived on read, or set directly by compaction middleware.
 * - Compaction summary + {@link compactIndex} apply to the model view in {@link getMessagesForLLM}.
 *
 * Token usage and pricing live on {@link UsageTracker} via {@link ManagedAgent.usage}.
 */
export class AgentContext {
  readonly id: string;
  readonly symbol = Symbol.for("agent-context");

  private uiMessages: UIMessage[] = [];
  private modelMessages: ModelMessage[] = [];

  private summaryMessage: ModelMessage | null = null;
  private compactIndex = 0;

  createdAt: number;
  updatedAt: number;

  constructor(props?: { id?: string }) {
    this.id = props?.id ?? generateContextId();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /** Replace UI history from the client; clears compaction middleware model overlay. */
  setUIMessages(messages: UIMessage[]): void {
    this.uiMessages = messages;
    this.modelMessages = convertMessagesToModelMessages(messages);
    this.touch();
  }

  getUIMessages(): UIMessage[] {
    return this.uiMessages;
  }

  /** Set model messages after compaction middleware mutates the in-run view. */
  setMessages(messages: ModelMessage[]): void {
    this.modelMessages = messages;
    this.touch();
  }

  /** Model view: derived from UI, or the compaction overlay when set. */
  getMessages(): ModelMessage[] {
    return this.modelMessages;
  }

  /**
   * Messages sent to the LLM after compaction summary is applied.
   * Dynamic per-turn context is injected by the caller after this returns.
   */
  getMessagesForLLM(): ModelMessage[] {
    const base = this.getMessages();
    if (this.summaryMessage) {
      return [this.summaryMessage, ...base.slice(this.compactIndex)];
    }
    return base;
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
    this.uiMessages = [];
    this.modelMessages = [];
    this.summaryMessage = null;
    this.compactIndex = 0;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
