import { generateId } from "../utils.js";

import { convertMessagesToModelMessages } from "@tanstack/ai";

import { buildCanonicalModelMessages } from "./build-canonical-model-messages.js";

import type { ModelMessage, UIMessage } from "@tanstack/ai";

export { buildCanonicalModelMessages } from "./build-canonical-model-messages.js";

export const generateContextId = (): string => generateId("ctx");

/**
 * Conversation state for an agent.
 *
 * - {@link UIMessage} history is the client-facing source of truth (approvals, tool parts).
 * - Canonical model messages are rebuilt from UI + in-run engine delta on each compaction pass.
 * - Compaction summary + {@link compactIndex} apply to the canonical view in {@link getMessagesForLLM}.
 *
 * Token usage and pricing live on {@link UsageTracker} via {@link ManagedAgent.usage}.
 */
export class AgentContext {
  readonly id: string;
  readonly symbol = Symbol.for("agent-context");

  private uiMessages: UIMessage[] = [];
  private runBaselineCount = 0;

  private summaryMessage: ModelMessage | null = null;
  private compactIndex = 0;

  createdAt: number;
  updatedAt: number;

  constructor(props?: { id?: string }) {
    this.id = props?.id ?? generateContextId();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /** Replace UI history from the client. Compaction summary + compactIndex are preserved. */
  setUIMessages(messages: UIMessage[]): void {
    this.uiMessages = messages;
    this.touch();
  }

  getUIMessages(): UIMessage[] {
    return this.uiMessages;
  }

  /** Model message count at the start of the current `chat()` invocation. */
  setRunBaselineCount(count: number): void {
    this.runBaselineCount = Math.max(0, count);
    this.touch();
  }

  getRunBaselineCount(): number {
    return this.runBaselineCount;
  }

  /**
   * Full model history: converted UI messages plus in-run engine appendices.
   * Pass TanStack engine messages from `onConfig` when available.
   */
  getCanonicalModelMessages(engineMessages: ModelMessage[] = []): ModelMessage[] {
    return buildCanonicalModelMessages(this.uiMessages, engineMessages, {
      runBaselineCount: this.runBaselineCount,
      summaryMessage: this.summaryMessage,
      compactIndex: this.compactIndex,
    });
  }

  /**
   * Messages sent to the LLM after compaction summary is applied.
   * Always slice the canonical history — never TanStack's possibly truncated engine state.
   */
  getMessagesForLLM(canon?: ModelMessage[]): ModelMessage[] {
    const base = canon ?? this.getCanonicalModelMessages();

    if (!this.summaryMessage) {
      return base;
    }

    return [this.summaryMessage, ...base.slice(this.compactIndex)];
  }

  /** Canonical model messages converted from the current UI history only. */
  getCanonicalFromUI(): ModelMessage[] {
    if (this.uiMessages.length === 0) return [];
    return convertMessagesToModelMessages(this.uiMessages);
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
    this.runBaselineCount = 0;
    this.summaryMessage = null;
    this.compactIndex = 0;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
