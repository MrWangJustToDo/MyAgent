import { formatAgentStreamError } from "../agent/utils/assert-async-iterable.js";
import {
  countPendingToolApprovals,
  hasPendingAskUser,
  hasPendingToolApprovals,
  needsToolPhaseContinue,
} from "../agent/utils/tool-phase-utils.js";

import { AgentUIChannel } from "./agent-ui-channel.js";

import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";
import type { ContentPart, UIMessage } from "@tanstack/ai";

const MAX_TOOL_PHASE_ITERATIONS = 20;

/**
 * Core-owned main chat session: StreamProcessor + explicit tool-phase continuation.
 * Status lives only on {@link ManagedAgent}; this class orchestrates runs only.
 */
export class AgentChatController {
  private readonly channel: AgentUIChannel;
  private runChain: Promise<void> = Promise.resolve();
  private runGeneration = 0;

  constructor(
    private readonly managed: ManagedAgent,
    private readonly manager: AgentManager,
    initialMessages?: UIMessage[]
  ) {
    this.channel = new AgentUIChannel({ initialMessages });
    this.managed.ui = this.channel;
  }

  getUIChannel(): AgentUIChannel {
    return this.channel;
  }

  getMessages(): UIMessage[] {
    return this.channel.getMessages();
  }

  subscribeMessages(listener: (messages: UIMessage[]) => void): () => void {
    return this.channel.subscribe(listener);
  }

  setMessages(messages: UIMessage[]): void {
    this.channel.setMessages(messages);
  }

  clearMessages(): void {
    this.channel.clearMessages();
    this.managed.setError("");
    this.managed.setStatus("idle");
  }

  stop(): void {
    this.managed.abort("user-cancelled");
    this.runGeneration += 1;
  }

  sendMessage(content: string | ContentPart[]): Promise<void> {
    this.channel.addUserMessage(content);
    return this.enqueueRun();
  }

  respondToToolApproval(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    this.channel.addToolApprovalResponse(approvalId, approved, reason);
    this.syncApprovalPauseFromMessages();
    return this.enqueueRun();
  }

  addToolResult(toolCallId: string, output: Record<string, unknown>): Promise<void> {
    this.channel.addToolResult(toolCallId, output);
    return this.enqueueRun();
  }

  private enqueueRun(): Promise<void> {
    this.runChain = this.runChain.then(() => this.pumpToolPhases());
    return this.runChain;
  }

  private async pumpToolPhases(): Promise<void> {
    const generation = ++this.runGeneration;
    this.managed.setError("");
    this.markRunStarting();

    for (let iteration = 0; iteration < MAX_TOOL_PHASE_ITERATIONS; iteration++) {
      if (generation !== this.runGeneration) return;

      const messages = this.channel.getMessages();
      if (hasPendingToolApprovals(messages)) break;
      if (hasPendingAskUser(messages)) break;

      if (iteration > 0 && !needsToolPhaseContinue(messages)) break;

      await this.executeStream(messages, generation);
      if (generation !== this.runGeneration) return;

      const after = this.channel.getMessages();
      if (hasPendingToolApprovals(after)) break;
      if (hasPendingAskUser(after)) break;
      if (!needsToolPhaseContinue(after)) break;
    }

    if (generation === this.runGeneration) {
      this.syncApprovalPauseFromMessages();
      this.persistMessages();
    }
  }

  /** Keep pending-approval UI state aligned with message parts after user responds. */
  private syncApprovalPauseFromMessages(): void {
    this.managed.syncInteractionStateFromUIMessages(this.channel.getMessages(), { whenClear: "running" });
  }

  /** Bridge prepareForRun gap before lifecycle middleware sets `running`. */
  private markRunStarting(): void {
    const messages = this.channel.getMessages();
    if (countPendingToolApprovals(messages) > 0) return;

    const { status } = this.managed;
    if (status === "awaiting_user" || status === "error" || status === "aborted") return;
    if (status === "waiting" || status === "idle" || status === "completed") {
      this.managed.setStatus("running");
    }
  }

  private async executeStream(messages: UIMessage[], generation: number): Promise<void> {
    this.managed.setupAbortController();

    const abortSignal = this.managed.run.currentAbortController?.signal;
    try {
      const stream = this.manager.runAgentStream(this.managed.id, { messages, abortSignal });
      await this.channel.consumeRun({ stream });
      this.syncApprovalPauseFromMessages();
    } catch (err) {
      if (generation !== this.runGeneration) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.managed.setError(formatAgentStreamError(error).message);
      if (!this.managed.isAbortError(err)) {
        this.managed.setStatus("error");
      }
      throw error;
    }
  }

  private persistMessages(): void {
    const messages = this.channel.getMessages();
    if (messages.length > 0) {
      this.managed.saveSessionUIMessages(messages);
    }
  }
}

/** Format stream errors for display (re-export for app convenience). */
export function formatChatError(error: Error | null): string | null {
  if (!error) return null;
  return formatAgentStreamError(error).message;
}
