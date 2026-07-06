/**
 * Consume a subagent text stream as UIMessage updates for read-only preview UI.
 */

import { readUIMessageStream, toUIMessageStream, type TextStreamPart, type ToolSet, type UIMessage } from "ai";

import { toolStreamOnError } from "../loop/tool-error-handler.js";
import { clearStreamingOutput, emitStreamingChunk } from "../tools/util/streaming-callback.js";

import { getSummaryStreamText } from "./extract-assistant-text.js";
import { subagentPreviewStore } from "./subagent-preview-store.js";

// ============================================================================
// Types
// ============================================================================

export interface ConsumeSubagentUIStreamOptions {
  subagentId: string;
  stream: ReadableStream<TextStreamPart<ToolSet>>;
  tools: ToolSet;
  /** Seed messages shown before the assistant response (typically one user turn). */
  initialMessages: UIMessage[];
  /** Parent task tool call ID — summary text streams here like run_command stdout. */
  parentTaskToolCallId?: string;
  onUpdate?: (messages: UIMessage[]) => void;
}

// ============================================================================
// Consumer
// ============================================================================

/**
 * Pipe a subagent `streamText` result into UIMessage snapshots.
 * Returns the final message list when the stream completes.
 */
export async function consumeSubagentUIStream(options: ConsumeSubagentUIStreamOptions): Promise<UIMessage[]> {
  const { subagentId, stream, tools, initialMessages, parentTaskToolCallId, onUpdate } = options;

  const uiChunkStream = toUIMessageStream({
    stream,
    tools,
    originalMessages: initialMessages,
    onError: toolStreamOnError,
  });

  const messageStream = readUIMessageStream({
    stream: uiChunkStream,
    onError: toolStreamOnError,
  });

  let latestMessages = initialMessages;
  let streamedSummaryLength = 0;

  if (parentTaskToolCallId) {
    clearStreamingOutput(parentTaskToolCallId);
  }

  for await (const assistantMessage of messageStream) {
    latestMessages = [...initialMessages, assistantMessage];
    subagentPreviewStore.set(subagentId, latestMessages);
    onUpdate?.(latestMessages);

    if (parentTaskToolCallId) {
      const summaryText = getSummaryStreamText(assistantMessage.parts);
      if (summaryText) {
        if (summaryText.length < streamedSummaryLength) {
          streamedSummaryLength = 0;
        }
        const delta = summaryText.slice(streamedSummaryLength);
        if (delta) {
          emitStreamingChunk(parentTaskToolCallId, "stdout", delta);
          streamedSummaryLength = summaryText.length;
        }
      } else {
        streamedSummaryLength = 0;
      }
    }
  }

  return latestMessages;
}
