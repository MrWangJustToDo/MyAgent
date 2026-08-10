import { runAgentOnce } from "../agent/run/run-agent-skeleton.js";
import { extractAssistantText } from "../agent/stream/extract-assistant-text.js";
import { throwOnRunError } from "../agent/stream/stream-errors.js";
import { AgentUIChannel } from "../agent/ui-channel.js";
import { formatAgentStreamError } from "../agent/utils/assert-async-iterable.js";
import { stripEmptyAssistantShells } from "../agent/utils/empty-assistant-shell.js";
import { EMPTY_MODEL_STREAM_MESSAGE, shouldFlagEmptyModelStream } from "../agent/utils/empty-model-stream.js";
import {
  cancelIncompleteToolCalls,
  hasCancellableIncompleteToolCalls,
  TOOL_CANCELLED_MESSAGE,
} from "../agent/utils/incomplete-tool-calls.js";
import { PendingMessageQueue, type QueueMode } from "../agent/utils/pending-message-queue.js";
import {
  hasPendingAskUser,
  hasPendingToolApprovals,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
} from "../agent/utils/tool-phase-utils.js";
import { Emitter } from "../utils/emitter.js";

import { isActiveStatus } from "./agent-status.js";

import type { AgentManager } from "./agent-manager.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { ContentPart, ToolCallPart, UIMessage } from "@tanstack/ai";

const MAX_TOOL_PHASE_ITERATIONS = 40;

export type QueuedMessageContent = string | ContentPart[];

export interface QueuedMessagesSnapshot {
  steer: QueuedMessageContent[];
  followUp: QueuedMessageContent[];
}

export type QueueUpdateListener = (snapshot: QueuedMessagesSnapshot) => void;

/**
 * Core-owned main chat session: StreamProcessor + explicit tool-phase continuation.
 * Status transitions are owned by {@link AgentStatusController} via status middleware.
 *
 * Mid-run user input uses two queues (Pi-style):
 * - {@link steer} — delivered after the current assistant/tool batch, before the next LLM call
 * - {@link followUp} — delivered only when the agent would otherwise stop
 */
export class AgentChatController {
  private readonly channel: AgentUIChannel;
  private runChain: Promise<void> = Promise.resolve();
  private runGeneration = 0;
  /** Nested-safe: abort can finish an old pump after a new one has started. */
  private pumpDepth = 0;

  private readonly steeringQueue = new PendingMessageQueue<QueuedMessageContent>();
  private readonly followUpQueue = new PendingMessageQueue<QueuedMessageContent>();
  private readonly queueEvents = new Emitter<{ change: QueuedMessagesSnapshot }>();

  constructor(
    private readonly managed: ManagedAgent,
    private readonly manager: AgentManager,
    initialMessages?: UIMessage[]
  ) {
    this.channel = new AgentUIChannel({ initialMessages });
    this.managed.setUIChannel(this.channel);
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
    this.clearQueuedMessages();
    this.channel.clearMessages();
    this.managed.resetAdmittedTurnContext();
    this.managed.resetSessionSyncTracker();
    this.managed.statusController.resetToIdle();
  }

  stop(): void {
    this.interruptCurrentRun("user-cancelled");
  }

  /**
   * Abort the in-flight pump, cancel incomplete tools, and finalize the aborted turn.
   * Bumps {@link runGeneration} so the old pump exits without double-finalizing.
   */
  private interruptCurrentRun(reason: string): void {
    this.clearQueuedMessages();
    this.managed.statusController.onUserCancel();
    this.managed.abort(reason);
    this.runGeneration += 1;
    // Immediately clear loading tool rows; stream teardown may still finalize later.
    this.applyCancelledIncompleteTools();
    // App no longer checkpoints on status — persist cancelled tools on abort.
    this.persistMessages("pump-complete");
    // Turn finalize here: bumping runGeneration makes the in-flight pump skip its outcome path.
    this.managed.finalizeRun(this.manager, "aborted");
  }

  /** How steering messages are drained at each drain point. */
  setSteeringMode(mode: QueueMode): void {
    this.steeringQueue.mode = mode;
  }

  getSteeringMode(): QueueMode {
    return this.steeringQueue.mode;
  }

  /** How follow-up messages are drained when the agent would stop. */
  setFollowUpMode(mode: QueueMode): void {
    this.followUpQueue.mode = mode;
  }

  getFollowUpMode(): QueueMode {
    return this.followUpQueue.mode;
  }

  getQueuedMessages(): QueuedMessagesSnapshot {
    return {
      steer: [...this.steeringQueue.peekAll()],
      followUp: [...this.followUpQueue.peekAll()],
    };
  }

  /**
   * Subscribe to typed queue events (`change` carries steer/followUp snapshot).
   * Fires the current snapshot immediately on subscribe.
   */
  on(type: "change", listener: (snapshot: QueuedMessagesSnapshot) => void): () => void {
    const unsub = this.queueEvents.on(type, listener);
    listener(this.getQueuedMessages());
    return unsub;
  }

  clearQueuedMessages(): QueuedMessagesSnapshot {
    const snapshot = {
      steer: this.steeringQueue.clear(),
      followUp: this.followUpQueue.clear(),
    };
    this.notifyQueueListeners();
    return snapshot;
  }

  /**
   * Queue a mid-run correction. Delivered after the current assistant turn / tool batch.
   * When idle, behaves like {@link sendMessage}.
   *
   * NOTE: This is no longer the default Enter keybinding. The default Enter
   * (while running) now calls {@link followUp} — it queues the message for
   * after the agent would naturally stop, then starts a new LLM turn.
   * Option+Enter calls {@link forceSubmit} — it aborts the current run,
   * cancels incomplete tools, injects the message, and starts a new pump.
   * `steer` is kept for programmatic use where you want the message to be
   * delivered within the same turn (before the next LLM call).
   */
  steer(content: QueuedMessageContent): void {
    if (!this.shouldDeferQueue()) {
      void this.sendMessage(content);
      return;
    }
    this.steeringQueue.enqueue(content);
    this.notifyQueueListeners();
  }

  /**
   * Queue a message for after the agent would otherwise stop.
   * When idle, behaves like {@link sendMessage}.
   *
   * This is the default Enter keybinding while the agent is running:
   * the message is delivered only after the current turn completes, then
   * starts a new LLM turn.
   */
  followUp(content: QueuedMessageContent): void {
    if (!this.shouldDeferQueue()) {
      void this.sendMessage(content);
      return;
    }
    this.followUpQueue.enqueue(content);
    this.notifyQueueListeners();
  }

  /**
   * Force-submit: abort the current run, cancel incomplete tools, finalize the
   * aborted turn, inject the message, and start a new pump immediately.
   *
   * This is the Option/Ctrl+Enter keybinding while the agent is running.
   */
  forceSubmit(content: string | ContentPart[]): void {
    this.interruptCurrentRun("force-submit");
    this.channel.addUserMessage(content);
    this.persistMessages("user-message");
    this.managed.statusController.reconcileWithPolicy(this.channel.getMessages(), "during-run");
    void this.enqueueRun();
  }

  sendMessage(content: string | ContentPart[]): Promise<void> {
    if (this.shouldDeferQueue()) {
      this.steer(content);
      return Promise.resolve();
    }
    // Only strips truncated/invalid leftover tools — never approval-responded / valid queues.
    this.applyCancelledIncompleteTools();
    this.channel.addUserMessage(content);
    this.persistMessages("user-message");
    return this.enqueueRun();
  }

  respondToToolApproval(approvalId: string, approved: boolean, reason?: string): Promise<void> {
    this.channel.addToolApprovalResponse(approvalId, approved, reason);
    this.managed.statusController.reconcileWithPolicy(this.channel.getMessages(), "during-run");
    return this.enqueueRun();
  }

  addToolResult(toolCallId: string, output: Record<string, unknown>): Promise<void> {
    this.channel.addToolResult(toolCallId, output);
    return this.enqueueRun();
  }

  private shouldDeferQueue(): boolean {
    // pumpDepth > 0 alone is not sufficient — the agent may have been aborted
    // (pump finally block hasn't run yet), and queuing a message here would
    // leave it stranded since the exiting pump never drains the queue.
    return isActiveStatus(this.managed.status);
  }

  private notifyQueueListeners(): void {
    this.queueEvents.emit("change", this.getQueuedMessages());
  }

  private enqueueRun(): Promise<void> {
    // Recover from a previous rejected pump so later sendMessage/approval calls still run.
    const run = () => this.pumpToolPhases();
    this.runChain = this.runChain.then(run, run);
    return this.runChain;
  }

  private drainSteerIntoChannel(): boolean {
    const items = this.steeringQueue.drain();
    if (items.length === 0) return false;
    for (const content of items) {
      this.channel.addUserMessage(content);
    }
    this.notifyQueueListeners();
    this.persistMessages("user-message");
    return true;
  }

  private drainFollowUpIntoChannel(): boolean {
    const items = this.followUpQueue.drain();
    if (items.length === 0) return false;
    for (const content of items) {
      this.channel.addUserMessage(content);
    }
    this.notifyQueueListeners();
    this.persistMessages("user-message");
    return true;
  }

  private hasQueuedMessages(): boolean {
    return this.steeringQueue.hasItems() || this.followUpQueue.hasItems();
  }

  private shouldKeepPumping(messages: UIMessage[]): boolean {
    return shouldContinueAgentPump(messages) || this.hasQueuedMessages();
  }

  /**
   * After tools finish (or when idle between turns): inject steer before the next LLM call.
   * Follow-up only when the agent would otherwise stop.
   * Returns false when the pump should exit.
   */
  private prepareContinuationIteration(messages: UIMessage[]): { continue: boolean; messages: UIMessage[] } {
    if (needsToolPhaseContinue(messages)) {
      // Still executing / resuming tools — do not inject user messages yet.
      this.managed.markNextPrepareAsContinuation();
      return { continue: true, messages };
    }

    const steered = this.drainSteerIntoChannel();
    let current = this.channel.getMessages();

    if (steered || needsAgentResponseAfterTools(current)) {
      this.managed.markNextPrepareAsContinuation();
      return { continue: true, messages: current };
    }

    const followed = this.drainFollowUpIntoChannel();
    if (!followed) {
      return { continue: false, messages: current };
    }
    current = this.channel.getMessages();
    this.managed.markNextPrepareAsContinuation();
    return { continue: true, messages: current };
  }

  private async pumpToolPhases(): Promise<void> {
    const generation = ++this.runGeneration;
    const turnStart = Date.now();
    this.pumpDepth += 1;
    this.managed.resetTurnLifecycle();
    this.managed.clearPrepareAsContinuation();
    this.managed.setError("");
    // Safe: skips approval-responded and valid input-complete (needed for `y` / tool-phase).
    this.applyCancelledIncompleteTools();

    let hasError = false;
    let llmCalls = 0;
    const messages = this.channel.getMessages();
    this.managed.statusController.prepareRunPhase(messages);

    try {
      for (let iteration = 0; iteration < MAX_TOOL_PHASE_ITERATIONS; iteration++) {
        if (hasError) break;
        if (generation !== this.runGeneration) return;

        let currentMessages = this.channel.getMessages();
        if (hasPendingToolApprovals(currentMessages)) break;
        if (hasPendingAskUser(currentMessages)) break;

        if (iteration > 0) {
          const prepared = this.prepareContinuationIteration(currentMessages);
          if (!prepared.continue) break;
          currentMessages = prepared.messages;
        }

        await this.executeStream(currentMessages, generation);
        llmCalls = iteration + 1;
        if (this.managed.status === "error") {
          hasError = true;
        }
        if (generation !== this.runGeneration) {
          // Stream may have finalized truncated tool args after Esc — cancel again.
          this.applyCancelledIncompleteTools();
          this.persistMessages("pump-complete");
          return;
        }

        this.syncPlanModeFromMessages();

        // Auto-approve tools during plan execution so the agent can
        // run without waiting for user confirmation on each tool call.
        this.autoApprovePendingTools();

        const after = this.channel.getMessages();
        if (hasPendingToolApprovals(after)) break;
        if (hasPendingAskUser(after)) break;
        if (!this.shouldKeepPumping(after)) break;
      }

      if (generation === this.runGeneration) {
        this.syncPlanModeFromMessages();
        const messages = this.channel.getMessages();
        // Prefer status already set by executeStream (error/abort) over message-derived waits.
        const outcomeKind =
          this.managed.status === "aborted"
            ? "aborted"
            : hasError || this.managed.status === "error"
              ? "error"
              : hasPendingToolApprovals(messages) || hasPendingAskUser(messages)
                ? "waiting"
                : "finished";
        this.managed.statusController.applyRunOutcome({
          kind: outcomeKind,
          messages,
          path: "chat",
          // Only supply a message when status is not already error (avoids duplicate stream-error).
          errorMessage:
            outcomeKind === "error" && this.managed.status !== "error"
              ? this.managed.getError() || "Stream execution failed"
              : undefined,
        });
        this.persistMessages("pump-complete");

        // Waiting (approval / ask_user) keeps turn context for the resume pump.
        if (outcomeKind === "finished" || outcomeKind === "aborted" || outcomeKind === "error") {
          this.managed.finalizeRun(this.manager, outcomeKind);
        }

        const totalUsage = this.managed.usage?.getTotal();
        const toolCallCount = this.channel
          .getMessages()
          .filter((m) => m.role === "assistant")
          .reduce((count, m) => count + m.parts.filter((p) => p.type === "tool-call").length, 0);
        this.managed.emitEvent("turn:summary", {
          llmCalls: llmCalls,
          toolCalls: toolCallCount,
          inputTokens: totalUsage?.inputTokens ?? 0,
          outputTokens: totalUsage?.outputTokens ?? 0,
          cacheReadTokens: totalUsage?.cacheReadTokens ?? 0,
          durationMs: Date.now() - turnStart,
        });
      }
    } finally {
      this.pumpDepth -= 1;
    }
  }

  private async executeStream(messages: UIMessage[], generation: number): Promise<void> {
    // AbortController is created inside prepareForRun (via runAgentStream) and wired
    // directly into TanStack chat. Do not create a second controller here — that used
    // to leave ManagedAgent.abort() aborting a controller chat was not listening to.
    // Outcome finalization (path: "chat") stays in pumpToolPhases after the full loop.
    const messagesBefore = messages;
    try {
      await runAgentOnce({
        manager: this.manager,
        agentId: this.managed.id,
        messages,
        channel: this.channel,
        transformStream: throwOnRunError,
      });
      if (generation !== this.runGeneration || this.managed.status === "aborted") {
        this.applyCancelledIncompleteTools();
        return;
      }

      // OpenAI-compatible streaming against SSO/HTML (HTTP 200) can yield zero chunks
      // without throwing. Treat "no model progress" as an error instead of Completed.
      const messagesAfter = this.channel.getMessages();
      if (shouldFlagEmptyModelStream(messagesBefore, messagesAfter) && this.managed.status !== "error") {
        this.managed.statusController.onRunError(EMPTY_MODEL_STREAM_MESSAGE);
        this.managed.log?.error("agent", EMPTY_MODEL_STREAM_MESSAGE);
        return;
      }

      this.managed.statusController.reconcileWithPolicy(messagesAfter, "during-run");
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
  }

  private persistMessages(reason: "user-message" | "pump-complete"): void {
    const messages = this.channel.getMessages();
    if (messages.length > 0) {
      this.managed.maybeSaveSessionUIMessages(messages, reason);
    }
  }

  /** Extract ## Plan / [DONE:n] from the latest assistant text while plan mode is active. */
  private syncPlanModeFromMessages(): void {
    if (this.managed.planMode.getPhase() === "off") return;
    const text = extractAssistantText(this.channel.getMessages());
    if (text) this.managed.planMode.onAssistantText(text);
  }

  /**
   * Auto-approve pending tools when auto mode is on, or plan mode is building.
   */
  private autoApprovePendingTools(): void {
    if (!this.managed.shouldAutoApprovePendingTools()) return;

    const messages = this.channel.getMessages();
    let didApprove = false;

    for (const part of messages.flatMap((m) => m.parts)) {
      if (part.type !== "tool-call") continue;
      const toolCall = part as ToolCallPart;
      if (toolCall.approval?.needsApproval === true && toolCall.approval.approved === undefined) {
        const approvalId = toolCall.approval.id;
        if (approvalId) {
          this.channel.addToolApprovalResponse(approvalId, true);
          didApprove = true;
        }
      }
    }

    if (didApprove) {
      this.managed.statusController.reconcileWithPolicy(this.channel.getMessages(), "during-run");
    }
  }
}

/** Format stream errors for display (re-export for app convenience). */
export function formatChatError(error: Error | null): string | null {
  if (!error) return null;
  return formatAgentStreamError(error).message;
}
