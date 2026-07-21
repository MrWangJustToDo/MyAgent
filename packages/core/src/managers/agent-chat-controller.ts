import { throwOnRunError } from "../agent/subagent/stream-errors.js";
import { formatAgentStreamError } from "../agent/utils/assert-async-iterable.js";
import { stripEmptyAssistantShells } from "../agent/utils/empty-assistant-shell.js";
import {
  cancelIncompleteToolCalls,
  hasCancellableIncompleteToolCalls,
  TOOL_CANCELLED_MESSAGE,
} from "../agent/utils/incomplete-tool-calls.js";
import {
  hasPendingAskUser,
  hasPendingToolApprovals,
  shouldContinueAgentPump,
} from "../agent/utils/tool-phase-utils.js";

import { AgentUIChannel } from "./agent-ui-channel.js";

import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";
import type { ContentPart, UIMessage } from "@tanstack/ai";

const MAX_TOOL_PHASE_ITERATIONS = 20;

/**
 * Core-owned main chat session: StreamProcessor + explicit tool-phase continuation.
 * Status transitions are owned by {@link AgentStatusController} via status middleware.
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
    this.managed.resetSessionSyncTracker();
    this.managed.statusController.resetToIdle();
  }

  stop(): void {
    this.managed.statusController.onUserCancel();
    this.managed.abort("user-cancelled");
    this.runGeneration += 1;
    // Immediately clear loading tool rows; stream teardown may still finalize later.
    this.applyCancelledIncompleteTools();
  }

  sendMessage(content: string | ContentPart[]): Promise<void> {
    // Only strips truncated/invalid leftover tools — never approval-responded / valid queues.
    this.applyCancelledIncompleteTools();
    this.channel.addUserMessage(content);
    return this.enqueueRun();
  }

  respondToToolApproval(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    this.channel.addToolApprovalResponse(approvalId, approved, reason);
    this.managed.syncContextFromUIMessages(this.channel.getMessages());
    this.managed.statusController.reconcileFromUIMessages(this.channel.getMessages(), { whenClear: "running" });
    return this.enqueueRun();
  }

  addToolResult(toolCallId: string, output: Record<string, unknown>): Promise<void> {
    this.channel.addToolResult(toolCallId, output);
    return this.enqueueRun();
  }

  private enqueueRun(): Promise<void> {
    // Recover from a previous rejected pump so later sendMessage/approval calls still run.
    const run = () => this.pumpToolPhases();
    this.runChain = this.runChain.then(run, run);
    return this.runChain;
  }

  private async pumpToolPhases(): Promise<void> {
    const generation = ++this.runGeneration;
    const turnStart = Date.now();
    this.managed.setError("");
    // Safe: skips approval-responded and valid input-complete (needed for `y` / tool-phase).
    this.applyCancelledIncompleteTools();

    let hasError = false;
    let llmCallCount = 0;
    const messages = this.channel.getMessages();
    this.managed.statusController.prepareRunPhase(messages);

    for (let iteration = 0; iteration < MAX_TOOL_PHASE_ITERATIONS; iteration++) {
      if (hasError) break;
      if (generation !== this.runGeneration) return;

      const currentMessages = this.channel.getMessages();
      if (hasPendingToolApprovals(currentMessages)) break;
      if (hasPendingAskUser(currentMessages)) break;

      if (iteration > 0 && !shouldContinueAgentPump(currentMessages)) break;

      await this.executeStream(currentMessages, generation);
      llmCallCount++;
      if (this.managed.status === "error") {
        hasError = true;
      }
      if (generation !== this.runGeneration) {
        // Stream may have finalized truncated tool args after Esc — cancel again.
        this.applyCancelledIncompleteTools();
        return;
      }

      const after = this.channel.getMessages();
      if (hasPendingToolApprovals(after)) break;
      if (hasPendingAskUser(after)) break;
      if (!shouldContinueAgentPump(after)) break;
    }

    if (generation === this.runGeneration) {
      this.managed.statusController.reconcileAfterRun(this.channel.getMessages());
      this.persistMessages();

      const totalUsage = this.managed.usage?.getTotal();
      const toolCallCount = this.channel
        .getMessages()
        .filter((m) => m.role === "assistant")
        .reduce((count, m) => count + m.parts.filter((p) => p.type === "tool-call").length, 0);
      this.managed.emitEvent("turn:summary", {
        llmCalls: llmCallCount,
        toolCalls: toolCallCount,
        inputTokens: totalUsage?.inputTokens ?? 0,
        outputTokens: totalUsage?.outputTokens ?? 0,
        cacheReadTokens: totalUsage?.cacheReadTokens ?? 0,
        durationMs: Date.now() - turnStart,
      });
    }
  }

  private async executeStream(messages: UIMessage[], generation: number): Promise<void> {
    // AbortController is created inside prepareForRun (via runAgentStream) and wired
    // directly into TanStack chat. Do not create a second controller here — that used
    // to leave ManagedAgent.abort() aborting a controller chat was not listening to.
    try {
      const stream = throwOnRunError(this.manager.runAgentStream(this.managed.id, { messages }));
      await this.channel.consumeRun({ stream });
      if (generation !== this.runGeneration || this.managed.status === "aborted") {
        this.applyCancelledIncompleteTools();
        return;
      }
      this.managed.statusController.reconcileFromUIMessages(this.channel.getMessages(), { whenClear: "running" });
    } catch (err) {
      if (generation !== this.runGeneration || this.managed.status === "aborted") {
        this.applyCancelledIncompleteTools();
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      const message = formatAgentStreamError(error).message;
      if (this.managed.isAbortError(err)) {
        this.managed.statusController.onExternalError(message, true);
        this.applyCancelledIncompleteTools();
      } else {
        // Surface stream failures in status + agent:stream-error (not silent Completed).
        this.managed.statusController.onRunError(message);
        this.managed.log?.error("agent", "Stream execution failed", error);
      }
      // Do not rethrow — hosts often do not catch sendMessage; an unhandled rejection
      // aborts the entire CLI process. Status/error on ManagedAgent is the signal.
    }
  }

  /** Mark aborted/truncated tool calls so they stop loading and are not resumed by the next pump. */
  private applyCancelledIncompleteTools(): void {
    const current = this.channel.getMessages();
    if (!hasCancellableIncompleteToolCalls(current)) return;
    const cancelled = cancelIncompleteToolCalls(current, TOOL_CANCELLED_MESSAGE);
    const cleaned = stripEmptyAssistantShells(cancelled);
    this.channel.setMessages(cleaned);
    this.managed.syncContextFromUIMessages(cleaned);
  }

  private persistMessages(): void {
    const messages = this.channel.getMessages();
    if (messages.length > 0) {
      this.managed.maybeSaveSessionUIMessages(messages, "pump-complete");
    }
  }
}

/** Format stream errors for display (re-export for app convenience). */
export function formatChatError(error: Error | null): string | null {
  if (!error) return null;
  return formatAgentStreamError(error).message;
}
