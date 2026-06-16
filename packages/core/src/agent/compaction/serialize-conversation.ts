/**
 * Conversation serialization for compaction summarization.
 *
 * Converts ModelMessage[] to a plain text transcript. This is the key technique
 * (from PI's compaction) to prevent the summarization LLM from generating tool
 * calls: instead of passing messages as ModelMessage[], we convert them to a
 * plain text transcript wrapped in tags.
 *
 * Format:
 *   [User]: ...
 *   [Assistant]: ...
 *   [Assistant tool calls]: name(args); ...
 *   [Tool result]: ...
 */

import { extractTextFromContent } from "./message-utils.js";

import type { ModelMessage } from "ai";

/** Maximum characters for a single tool result in serialized output */
const TOOL_RESULT_MAX_CHARS = 2000;

/**
 * Serialize ModelMessage[] to plain text for summarization.
 */
export function serializeConversation(messages: ModelMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = extractTextFromContent(msg.content);
      if (text) parts.push(`[User]: ${text}`);
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        if (msg.content) parts.push(`[Assistant]: ${msg.content}`);
        continue;
      }
      if (!Array.isArray(msg.content)) continue;

      const textParts: string[] = [];
      const toolCalls: string[] = [];

      for (const part of msg.content) {
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          textParts.push(p.text);
        } else if (p.type === "tool-call") {
          const name = (p.toolName as string) || "unknown";
          let argsStr = "";
          try {
            const raw = typeof p.args === "string" ? p.args : JSON.stringify(p.args);
            argsStr = raw.length > 200 ? raw.slice(0, 200) + "..." : raw;
          } catch {
            argsStr = "(args)";
          }
          toolCalls.push(`${name}(${argsStr})`);
        }
      }

      if (textParts.length > 0) parts.push(`[Assistant]: ${textParts.join("\n")}`);
      if (toolCalls.length > 0) parts.push(`[Assistant tool calls]: ${toolCalls.join("; ")}`);
    } else if (msg.role === "tool") {
      if (!Array.isArray(msg.content)) continue;

      for (const part of msg.content) {
        const p = part as Record<string, unknown>;
        if (p.type === "tool-result") {
          const name = (p.toolName as string) || "tool";
          let resultText = "";
          try {
            const raw = typeof p.result === "string" ? p.result : JSON.stringify(p.result);
            resultText =
              raw.length > TOOL_RESULT_MAX_CHARS
                ? raw.slice(0, TOOL_RESULT_MAX_CHARS) + `\n[... ${raw.length - TOOL_RESULT_MAX_CHARS} chars truncated]`
                : raw;
          } catch {
            resultText = "(result)";
          }
          parts.push(`[Tool result from ${name}]: ${resultText}`);
        }
      }
    }
  }

  return parts.join("\n\n");
}
