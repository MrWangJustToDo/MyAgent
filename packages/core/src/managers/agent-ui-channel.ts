/**
 * TanStack StreamProcessor wrapper for subagent preview and non-useChat consumers.
 */

import { StreamProcessor } from "@tanstack/ai";

import { BEGIN_SUMMARY_TOOL_NAME } from "../agent/subagent/begin-summary-tool.js";
import {
  getSummaryStreamText,
  resolveTaskRunPhase,
  type TaskRunPhase,
  type TaskSummaryStreamState,
} from "../agent/subagent/extract-assistant-text.js";
import { throwOnRunError } from "../agent/subagent/stream-errors.js";
import { clearStreamingOutput, emitStreamingChunk } from "../agent/tools/util/streaming-callback.js";
import { applyToolDenialReason } from "../agent/utils/apply-tool-denial-reason.js";
import { stripEmptyAssistantShells } from "../agent/utils/empty-assistant-shell.js";

import type { StreamChunk, StreamProcessorEvents, UIMessage as TanStackUIMessage, ContentPart } from "@tanstack/ai";

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
  /** Parent task tool call ID — summary text streams here like run_command stdout. */
  parentTaskToolCallId?: string;
  /**
   * Agent id that owns the parent task tool UI (usually the parent agent).
   * Used to scope streaming emits for task summary.
   */
  streamingAgentId?: string;
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

// ============================================================================
// AgentUIChannel
// ============================================================================

/**
 * Converts agent run streams into observable TanStack {@link UIMessage} snapshots.
 * Main chat uses {@link AgentChatController}; subagent preview uses this directly.
 */
export class AgentUIChannel {
  private readonly processor: StreamProcessor;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly approvalListeners = new Set<ApprovalListener>();
  private readonly customEventListeners = new Set<UICustomEventListener>();
  private parentTaskToolCallId?: string;
  private streamingAgentId?: string;
  private onUpdate?: (messages: TanStackUIMessage[]) => void;
  private streamedSummaryLength = 0;
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

  subscribe(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
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

  /** Process a single stream chunk (for incremental bridge during `runAgent`). */
  processChunk(chunk: StreamChunk): void {
    this.trackSummaryStreamPhase(chunk);
    this.processor.processChunk(chunk);
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
    this.beginSummaryStream(options.parentTaskToolCallId, options.onUpdate, options.streamingAgentId);

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

  private beginSummaryStream(
    parentTaskToolCallId: string | undefined,
    onUpdate: ConsumeRunOptions["onUpdate"],
    streamingAgentId?: string
  ): void {
    this.parentTaskToolCallId = parentTaskToolCallId;
    this.streamingAgentId = streamingAgentId;
    this.onUpdate = onUpdate;
    this.streamedSummaryLength = 0;
    this.summaryStreamState = { summaryPhaseUnlocked: false };
    this.currentTurnMessageId = undefined;

    if (parentTaskToolCallId && streamingAgentId) {
      clearStreamingOutput(parentTaskToolCallId, { agentId: streamingAgentId });
    }
  }

  private endSummaryStream(): void {
    this.parentTaskToolCallId = undefined;
    this.streamingAgentId = undefined;
    this.onUpdate = undefined;
    this.streamedSummaryLength = 0;
    this.summaryStreamState = { summaryPhaseUnlocked: false };
    this.currentTurnMessageId = undefined;
  }

  private emitScopedChunk(toolCallId: string, type: "stdout" | "stderr", chunk: string): void {
    if (!this.streamingAgentId) return;
    emitStreamingChunk(toolCallId, type, chunk, { agentId: this.streamingAgentId });
  }

  private clearScopedOutput(toolCallId: string): void {
    if (!this.streamingAgentId) return;
    clearStreamingOutput(toolCallId, { agentId: this.streamingAgentId });
  }

  private trackSummaryStreamPhase(chunk: StreamChunk): void {
    if (!this.parentTaskToolCallId) return;

    const messageId = readTextMessageId(chunk);
    if (messageId) {
      this.currentTurnMessageId = messageId;
    }

    const toolName = readToolCallName(chunk);
    if (toolName === BEGIN_SUMMARY_TOOL_NAME) {
      this.summaryStreamState = { summaryPhaseUnlocked: true };
      this.clearScopedOutput(this.parentTaskToolCallId);
      this.streamedSummaryLength = 0;
    }
  }

  private getCurrentTurnParts(messages: TanStackUIMessage[]) {
    if (this.currentTurnMessageId) {
      const current = messages.find((message) => message.id === this.currentTurnMessageId);
      if (current?.role === "assistant") return current.parts;
    }

    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return lastAssistant?.parts ?? [];
  }

  private handleMessagesChange(messages: TanStackUIMessage[]): void {
    this.onUpdate?.(messages);

    for (const listener of this.messageListeners) {
      try {
        listener(messages);
      } catch {
        // Ignore listener errors
      }
    }

    if (!this.parentTaskToolCallId) return;

    const summaryText = getSummaryStreamText(this.getCurrentTurnParts(messages), this.summaryStreamState);
    if (summaryText) {
      if (summaryText.length < this.streamedSummaryLength) {
        this.streamedSummaryLength = 0;
      }
      const delta = summaryText.slice(this.streamedSummaryLength);
      if (delta) {
        this.emitScopedChunk(this.parentTaskToolCallId, "stdout", delta);
        this.streamedSummaryLength = summaryText.length;
      }
    } else if (this.streamedSummaryLength > 0) {
      this.streamedSummaryLength = 0;
      this.clearScopedOutput(this.parentTaskToolCallId);
    }
  }
}
