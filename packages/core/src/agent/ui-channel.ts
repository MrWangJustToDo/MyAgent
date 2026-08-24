/**
 * TanStack StreamProcessor wrapper for subagent preview and non-useChat consumers.
 */

import { StreamProcessor } from "@tanstack/ai";

import { Emitter } from "../utils/emitter.js";

import { repairMessagesSnapshotChunk } from "./media/repair-stringified-multimodal.js";
import { applyToolDenialReason } from "./run-helpers/apply-tool-denial-reason.js";
import { stripEmptyAssistantShells } from "./run-helpers/empty-assistant-shell.js";
import { shouldSuppressMessagesSnapshot } from "./run-helpers/suppress-messages-snapshot.js";
import { shouldSuppressReplayedToolChunk } from "./run-helpers/suppress-replayed-tool-chunks.js";
import {
  resolveTaskRunPhase,
  type TaskRunPhase,
  type TaskSummaryStreamState,
} from "./stream/extract-assistant-text.js";
import { throwOnRunError } from "./stream/stream-errors.js";
import { BEGIN_SUMMARY_TOOL_NAME } from "./subagent/begin-summary-tool.js";
import { summaryStreamKey, type SummaryStreamHub } from "./summary-stream";

import type { StreamChunk, StreamProcessorEvents, UIMessage as TanStackUIMessage, ContentPart } from "@tanstack/ai";

type UIChannelEvents = {
  messages: TanStackUIMessage[];
};

// ============================================================================
// Types
// ============================================================================

export type UIApprovalRequest =
  NonNullable<StreamProcessorEvents["onApprovalRequest"]> extends (args: infer A) => void ? A : never;

export type UICustomEventListener = NonNullable<StreamProcessorEvents["onCustomEvent"]>;

export interface AgentUIChannelOptions {
  initialMessages?: TanStackUIMessage[];
  onApprovalRequest?: (request: UIApprovalRequest) => void;
  onCustomEvent?: UICustomEventListener;
}

export interface ConsumeRunOptions {
  stream: AsyncIterable<StreamChunk>;
  /** Parent task tool call ID — summary text streams via {@link summaryHub}. */
  parentTaskToolCallId?: string;
  /**
   * Agent id that owns the parent task tool UI (usually the parent agent).
   * Kept for callers / events; summary emits go through {@link summaryHub}.
   */
  streamingAgentId?: string;
  /**
   * Parent agent's summary stream hub. When set with task or compact ids,
   * TEXT deltas are appended after the stream is unlocked (begin_summary or compact).
   */
  summaryHub?: SummaryStreamHub;
  /** Compact stream id when this run produces a compact summary. */
  compactId?: string;
  onUpdate?: (messages: TanStackUIMessage[]) => void;
}

type MessageListener = (messages: TanStackUIMessage[]) => void;
type ApprovalListener = (request: UIApprovalRequest) => void;

function readToolCallName(chunk: StreamChunk): string | undefined {
  if (chunk.type !== "TOOL_CALL_START") return undefined;
  const record = chunk as { toolName?: string };
  return typeof record.toolName === "string" ? record.toolName : undefined;
}

function readTextMessageId(chunk: StreamChunk): string | undefined {
  if (chunk.type !== "TEXT_MESSAGE_START") return undefined;
  const record = chunk as { messageId?: string };
  return typeof record.messageId === "string" && record.messageId.length > 0 ? record.messageId : undefined;
}

function readTextDelta(chunk: StreamChunk): string | undefined {
  if (chunk.type !== "TEXT_MESSAGE_CONTENT") return undefined;
  const record = chunk as { delta?: unknown };
  return typeof record.delta === "string" ? record.delta : undefined;
}

// ============================================================================
// AgentUIChannel
// ============================================================================

/**
 * Converts agent run streams into observable TanStack {@link UIMessage} snapshots.
 * InteractiveChat and Worker UI runs attach this via `ensureUIChannel` / `runAgentOnce`.
 */
export class AgentUIChannel {
  private readonly processor: StreamProcessor;
  private readonly messageEvents = new Emitter<UIChannelEvents>();
  private readonly approvalListeners = new Set<ApprovalListener>();
  private readonly customEventListeners = new Set<UICustomEventListener>();
  private parentTaskToolCallId?: string;
  private streamingAgentId?: string;
  private summaryHub?: SummaryStreamHub;
  private compactId?: string;
  private activeSummaryKey?: string;
  private onUpdate?: (messages: TanStackUIMessage[]) => void;
  private summaryStreamState: TaskSummaryStreamState = { summaryPhaseUnlocked: false };
  /** Active agent-loop turn assistant message (per-turn streaming scope). */
  private currentTurnMessageId?: string;

  /** Current task run phase for parent task tool UI (`tools` vs `summary`). */
  getTaskRunPhase(): TaskRunPhase {
    return resolveTaskRunPhase(this.getMessages(), this.summaryStreamState);
  }

  constructor(options: AgentUIChannelOptions = {}) {
    this.processor = new StreamProcessor({
      initialMessages: options.initialMessages,
      events: {
        onMessagesChange: (messages) => this.handleMessagesChange(messages),
        onApprovalRequest: (request) => {
          options.onApprovalRequest?.(request);
          for (const listener of this.approvalListeners) {
            try {
              listener(request);
            } catch {
              // Ignore listener errors
            }
          }
        },
        onCustomEvent: (eventType, data, context) => {
          options.onCustomEvent?.(eventType, data, context);
          for (const listener of this.customEventListeners) {
            try {
              listener(eventType, data, context);
            } catch {
              // Ignore listener errors
            }
          }
        },
      },
    });
  }

  getMessages(): TanStackUIMessage[] {
    return this.processor.getMessages();
  }

  setMessages(messages: TanStackUIMessage[]): void {
    this.processor.setMessages(messages);
  }

  clearMessages(): void {
    this.processor.clearMessages();
  }

  addUserMessage(content: string | ContentPart[], id?: string): TanStackUIMessage {
    return this.processor.addUserMessage(content, id);
  }

  addToolApprovalResponse(approvalId: string, approved: boolean, reason?: string): void {
    this.processor.addToolApprovalResponse(approvalId, approved);
    if (!approved) {
      this.processor.setMessages(applyToolDenialReason(this.processor.getMessages(), approvalId, reason));
    }
  }

  addToolResult(toolCallId: string, output: unknown, error?: string): void {
    this.processor.addToolResult(toolCallId, output, error);
  }

  /** Subscribe to typed UI events (`messages` carries full UIMessage[]). */
  on<K extends keyof UIChannelEvents>(type: K, listener: (payload: UIChannelEvents[K]) => void): () => void {
    return this.messageEvents.on(type, listener);
  }

  subscribe(listener: MessageListener): () => void {
    return this.messageEvents.on("messages", listener);
  }

  subscribeApprovalRequests(listener: ApprovalListener): () => void {
    this.approvalListeners.add(listener);
    return () => {
      this.approvalListeners.delete(listener);
    };
  }

  subscribeCustomEvents(listener: UICustomEventListener): () => void {
    this.customEventListeners.add(listener);
    return () => {
      this.customEventListeners.delete(listener);
    };
  }

  /**
   * Clear channel history and reset summary streaming state after a failed run.
   *
   * Used by subagent runners so a failed (non-aborted) run does not leave stale
   * partial tool rows / summary text in the preview, and so the task-tool phase
   * rolls back out of `summary`. Aborted runs intentionally keep partial work.
   */
  failRun(): void {
    this.clearMessages();
    this.endSummaryStream();
  }

  /**
   * Soft-reset UI before a restart-style stream recovery (transient / capability).
   *
   * Keeps the first user prompt, drops assistant/tool rows, and rolls the task
   * phase out of `summary`. Unlike {@link failRun}, does **not** end the active
   * summary hub subscription — {@link consumeRun} still owns that lifecycle.
   *
   * Call this when `runStreamWithRecovery` retries a subagent stream so the task
   * panel does not keep stale tools / summary text while the model restarts.
   */
  resetForStreamRetry(): void {
    // Keep ALL leading user messages — subagent channels are seeded with a
    // synthetic <turn_context> user message before the real task prompt, so
    // keeping only the first user message would drop the prompt itself.
    const kept: TanStackUIMessage[] = [];
    for (const message of this.getMessages()) {
      if (message.role !== "user") break;
      kept.push(message);
    }
    this.setMessages(kept);
    this.currentTurnMessageId = undefined;

    if (this.summaryHub && this.parentTaskToolCallId && !this.compactId) {
      this.summaryHub.reset({ source: "task", toolCallId: this.parentTaskToolCallId });
      this.activeSummaryKey = summaryStreamKey("task", this.parentTaskToolCallId);
      this.summaryStreamState = { summaryPhaseUnlocked: false };
      return;
    }

    if (this.summaryHub && this.compactId) {
      this.summaryHub.reset({ source: "compact", compactId: this.compactId });
      this.activeSummaryKey = summaryStreamKey("compact", this.compactId);
      this.summaryStreamState = { summaryPhaseUnlocked: true };
      return;
    }

    this.summaryStreamState = { summaryPhaseUnlocked: false };
  }

  /** Process a single stream chunk (for incremental bridge during `runAgent`). */
  processChunk(chunk: StreamChunk): void {
    // Engine snapshots must not replace the chronological channel (summary-first
    // wire, or ordinary interrupt rebuilds that drop approval/state).
    if (shouldSuppressMessagesSnapshot(chunk)) {
      return;
    }
    const normalized = repairMessagesSnapshotChunk(chunk);
    if (shouldSuppressReplayedToolChunk(this.getMessages(), normalized)) {
      return;
    }
    this.trackSummaryStreamPhase(normalized);
    this.appendSummaryDelta(normalized);
    this.processor.processChunk(normalized);
  }

  /** Finalize an incrementally processed stream. */
  finalizeStream(): void {
    this.processor.finalizeStream();
    const cleaned = stripEmptyAssistantShells(this.processor.getMessages());
    if (cleaned.length !== this.processor.getMessages().length) {
      this.processor.setMessages(cleaned);
    }
  }

  /**
   * Consume a TanStack {@link StreamChunk} stream and return final messages.
   */
  async consumeRun(options: ConsumeRunOptions): Promise<TanStackUIMessage[]> {
    this.beginSummaryStream(options);

    try {
      for await (const chunk of throwOnRunError(options.stream)) {
        this.processChunk(chunk);
      }
      this.finalizeStream();
      return this.getMessages();
    } finally {
      this.endSummaryStream();
    }
  }

  private beginSummaryStream(options: ConsumeRunOptions): void {
    this.parentTaskToolCallId = options.parentTaskToolCallId;
    this.streamingAgentId = options.streamingAgentId;
    this.summaryHub = options.summaryHub;
    this.compactId = options.compactId;
    this.onUpdate = options.onUpdate;
    this.summaryStreamState = { summaryPhaseUnlocked: false };
    this.currentTurnMessageId = undefined;
    this.activeSummaryKey = undefined;

    // Compact summarizer: unlock immediately and reset the compact stream.
    if (this.summaryHub && this.compactId) {
      this.summaryStreamState = { summaryPhaseUnlocked: true };
      this.summaryHub.reset({ source: "compact", compactId: this.compactId });
      this.activeSummaryKey = summaryStreamKey("compact", this.compactId);
    }
  }

  private endSummaryStream(): void {
    if (this.summaryHub && this.activeSummaryKey) {
      this.summaryHub.end(this.activeSummaryKey);
    }
    this.parentTaskToolCallId = undefined;
    this.streamingAgentId = undefined;
    this.summaryHub = undefined;
    this.compactId = undefined;
    this.activeSummaryKey = undefined;
    this.onUpdate = undefined;
    this.summaryStreamState = { summaryPhaseUnlocked: false };
    this.currentTurnMessageId = undefined;
  }

  private trackSummaryStreamPhase(chunk: StreamChunk): void {
    const messageId = readTextMessageId(chunk);
    if (messageId) {
      this.currentTurnMessageId = messageId;
    }

    if (!this.summaryHub || !this.parentTaskToolCallId || this.compactId) return;

    const toolName = readToolCallName(chunk);
    if (toolName !== BEGIN_SUMMARY_TOOL_NAME) return;

    this.summaryStreamState = { summaryPhaseUnlocked: true };
    this.summaryHub.reset({ source: "task", toolCallId: this.parentTaskToolCallId });
    this.activeSummaryKey = summaryStreamKey("task", this.parentTaskToolCallId);
  }

  private appendSummaryDelta(chunk: StreamChunk): void {
    if (!this.summaryHub || !this.activeSummaryKey) return;
    if (!this.summaryStreamState.summaryPhaseUnlocked) return;
    const delta = readTextDelta(chunk);
    if (!delta) return;
    this.summaryHub.append(this.activeSummaryKey, delta);
  }

  private handleMessagesChange(messages: TanStackUIMessage[]): void {
    this.onUpdate?.(messages);
    this.messageEvents.emit("messages", messages);
    // Summary streaming is driven by TEXT_MESSAGE_CONTENT chunks in processChunk —
    // do not diff UIMessage snapshots (that caused mid-stream flicker).
  }
}
