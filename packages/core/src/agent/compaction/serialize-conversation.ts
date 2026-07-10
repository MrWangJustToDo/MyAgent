/**
 * Conversation serialization for compaction summarization.
 *
 * Converts TanStack ModelMessage[] to a plain text transcript. This prevents
 * the summarization LLM from generating tool calls.
 *
 * Format:
 *   [User]: ...
 *   [Assistant]: ...
 *   [Assistant tool calls]: name(args); ...
 *   [Tool result from name]: ...
 */

import { buildToolCallNameMap, extractTextFromContent, serializeToolMessageContent } from "./message-utils.js";

import type { ModelMessage } from "@tanstack/ai";

/** Maximum characters for a single tool result in serialized output */
const TOOL_RESULT_MAX_CHARS = 2000;

function truncateToolArgs(args: string): string {
  return args.length > 200 ? args.slice(0, 200) + "..." : args;
}

function truncateToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return text.slice(0, TOOL_RESULT_MAX_CHARS) + `\n[... ${text.length - TOOL_RESULT_MAX_CHARS} chars truncated]`;
}

/**
 * Serialize ModelMessage[] to plain text for summarization.
 */
export function serializeConversation(messages: ModelMessage[]): string {
  const parts: string[] = [];
  const toolCallMap = buildToolCallNameMap(messages);

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = extractTextFromContent(msg.content);
      if (text) parts.push(`[User]: ${text}`);
      continue;
    }

    if (msg.role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text) parts.push(`[Assistant]: ${text}`);

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const toolCalls = msg.toolCalls.map((tc) => {
          const args = truncateToolArgs(tc.function.arguments);
          return `${tc.function.name}(${args})`;
        });
        parts.push(`[Assistant tool calls]: ${toolCalls.join("; ")}`);
      }
      continue;
    }

    if (msg.role === "tool") {
      const toolName = (msg.toolCallId && toolCallMap.get(msg.toolCallId)) || "tool";
      const resultText = truncateToolResult(serializeToolMessageContent(msg.content));
      if (resultText) {
        parts.push(`[Tool result from ${toolName}]: ${resultText}`);
      }
    }
  }

  return parts.join("\n\n");
}
