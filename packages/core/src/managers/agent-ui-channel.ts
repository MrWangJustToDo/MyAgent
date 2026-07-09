/**
 * TanStack StreamProcessor wrapper for subagent preview and non-useChat consumers.
 */

import { StreamProcessor } from "@tanstack/ai";

import { getSummaryStreamText } from "../agent/subagent/extract-assistant-text.js";
import { clearStreamingOutput, emitStreamingChunk } from "../agent/tools/util/streaming-callback.js";
import { applyToolDenialReason } from "../agent/utils/apply-tool-denial-reason.js";

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
  onUpdate?: (messages: TanStackUIMessage[]) => void;
}

type MessageListener = (messages: TanStackUIMessage[]) => void;
type ApprovalListener = (request: UIApprovalRequest) => void;

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
  private onUpdate?: (messages: TanStackUIMessage[]) => void;
  private streamedSummaryLength = 0;

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
    this.processor.processChunk(chunk);
  }

  /** Finalize an incrementally processed stream. */
  finalizeStream(): void {
    this.processor.finalizeStream();
  }

  /**
   * Consume a TanStack {@link StreamChunk} stream and return final messages.
   */
  async consumeRun(options: ConsumeRunOptions): Promise<TanStackUIMessage[]> {
    this.beginSummaryStream(options.parentTaskToolCallId, options.onUpdate);

    try {
      for await (const chunk of options.stream) {
        this.processChunk(chunk);
      }
      this.finalizeStream();
      return this.getMessages();
    } finally {
      this.endSummaryStream();
    }
  }

  private beginSummaryStream(parentTaskToolCallId: string | undefined, onUpdate: ConsumeRunOptions["onUpdate"]): void {
    this.parentTaskToolCallId = parentTaskToolCallId;
    this.onUpdate = onUpdate;
    this.streamedSummaryLength = 0;

    if (parentTaskToolCallId) {
      clearStreamingOutput(parentTaskToolCallId);
    }
  }

  private endSummaryStream(): void {
    this.parentTaskToolCallId = undefined;
    this.onUpdate = undefined;
    this.streamedSummaryLength = 0;
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

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const summaryText = getSummaryStreamText(lastAssistant.parts);
    if (summaryText) {
      if (summaryText.length < this.streamedSummaryLength) {
        this.streamedSummaryLength = 0;
      }
      const delta = summaryText.slice(this.streamedSummaryLength);
      if (delta) {
        emitStreamingChunk(this.parentTaskToolCallId, "stdout", delta);
        this.streamedSummaryLength = summaryText.length;
      }
    } else {
      this.streamedSummaryLength = 0;
    }
  }
}
