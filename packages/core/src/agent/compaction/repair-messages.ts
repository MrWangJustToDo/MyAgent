/**
 * Repair orphaned tool messages in a message array.
 *
 * Some LLM APIs (OpenAI, DeepSeek, etc.) require that every message with
 * role "tool" must immediately follow an "assistant" message that contains
 * the corresponding tool_call. When compaction, session restore, or message
 * sync produces an orphaned "tool" message, the API rejects the request with:
 *
 *   "Messages with role 'tool' must be a response to a preceding message with 'tool_calls'"
 *
 * This module provides a repair function that removes orphaned tool messages
 * to prevent this error.
 */

import type { ModelMessage } from "ai";

/**
 * Check whether an assistant message contains any tool-call parts.
 */
function assistantHasToolCalls(message: ModelMessage): boolean {
  if (message.role !== "assistant") return false;
  const content = message.content;
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    const p = part as Record<string, unknown>;
    return p.type === "tool-call";
  });
}

/**
 * Collect all tool-call IDs from an assistant message.
 */
function getToolCallIds(message: ModelMessage): Set<string> {
  const ids = new Set<string>();
  if (message.role !== "assistant") return ids;
  const content = message.content;
  if (!Array.isArray(content)) return ids;
  for (const part of content) {
    const p = part as Record<string, unknown>;
    if (p.type === "tool-call" && typeof p.toolCallId === "string") {
      ids.add(p.toolCallId);
    }
  }
  return ids;
}

/**
 * Get the tool-call ID from a tool result message.
 */
function getToolResultId(message: ModelMessage): string | null {
  if (message.role !== "tool") return null;
  const content = message.content;
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    const p = part as Record<string, unknown>;
    if (p.type === "tool-result" && typeof p.toolCallId === "string") {
      return p.toolCallId;
    }
  }
  return null;
}

/**
 * Remove orphaned tool messages that have no matching preceding assistant(tool_calls).
 *
 * Walks through messages and tracks which tool-call IDs are "pending" (from
 * assistant messages). Tool messages whose IDs aren't in the pending set are
 * dropped. This handles all edge cases: compaction cuts, session restore,
 * and message sync misalignment.
 *
 * @param messages - Message array to repair
 * @returns Repaired message array (original array if no repairs needed)
 */
export function repairOrphanedToolMessages(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;

  // Quick check: if there are no tool messages, nothing to repair
  if (!messages.some((m) => m.role === "tool")) return messages;

  const pendingToolCallIds = new Set<string>();
  const result: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "assistant" && assistantHasToolCalls(message)) {
      for (const id of getToolCallIds(message)) {
        pendingToolCallIds.add(id);
      }
      result.push(message);
    } else if (message.role === "tool") {
      const toolCallId = getToolResultId(message);
      if (toolCallId && pendingToolCallIds.has(toolCallId)) {
        pendingToolCallIds.delete(toolCallId);
        result.push(message);
      }
      // else: orphaned tool message — drop it
    } else {
      result.push(message);
    }
  }

  return result;
}
