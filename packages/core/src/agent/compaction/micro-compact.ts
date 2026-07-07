/**
 * Micro Compaction (Layer 1) - Replace old tool results with placeholders.
 *
 * This runs automatically before each LLM call and provides gradual compression
 * by replacing old `role: "tool"` message content with `[Previous: used {tool_name}]`.
 *
 * Rules:
 * - Preserves the N most recent tool results (configurable)
 * - Skips small tool results (< minToolResultSize characters)
 * - Tracks toolCallId → tool name via assistant `toolCalls`
 *
 * Uses TanStack {@link ModelMessage} types.
 */

import { buildToolCallNameMap, getToolMessageContentSize, serializeToolMessageContent } from "./message-utils.js";

import type { CompactionConfig } from "./types.js";
import type { ModelMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** Tools whose results should never be pruned/compacted. */
const PROTECTED_TOOLS = new Set(["skill", "load_skill", "list_skills", "compact", "todo"]);

/** Placeholder prefix used to detect already-compacted results. */
const PLACEHOLDER_PREFIX = "[Previous: used ";

// ============================================================================
// Helper Functions
// ============================================================================

function createPlaceholder(toolName: string): string {
  return `${PLACEHOLDER_PREFIX}${toolName}]`;
}

function isAlreadyCompacted(content: ModelMessage["content"]): boolean {
  const serialized = serializeToolMessageContent(content);
  return serialized.startsWith(PLACEHOLDER_PREFIX);
}

function applyPlaceholder(message: ModelMessage, placeholder: string): void {
  if (typeof message.content === "string" || message.content === null) {
    message.content = placeholder;
    return;
  }

  if (Array.isArray(message.content)) {
    message.content = [{ type: "text", content: placeholder }];
  }
}

interface ToolResultRef {
  messageIndex: number;
  toolCallId: string;
  size: number;
}

function findToolResultMessages(messages: ModelMessage[]): ToolResultRef[] {
  const results: ToolResultRef[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "tool") continue;

    results.push({
      messageIndex: i,
      toolCallId: message.toolCallId ?? "",
      size: getToolMessageContentSize(message.content),
    });
  }

  return results;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply micro compaction to messages.
 *
 * Replaces old tool message content with placeholders while preserving
 * recent tool results and small results.
 */
export function microCompact(messages: ModelMessage[], config: Partial<CompactionConfig> = {}): ModelMessage[] {
  const { keepRecentToolResults = 3, minToolResultSize = 100 } = config;

  const toolCallMap = buildToolCallNameMap(messages);
  const toolResults = findToolResultMessages(messages);

  if (toolResults.length <= keepRecentToolResults) {
    return messages;
  }

  const toCompact = toolResults.slice(0, toolResults.length - keepRecentToolResults);

  const compactTargets = toCompact.filter((tr) => {
    if (tr.size < minToolResultSize) return false;

    const toolName = toolCallMap.get(tr.toolCallId);
    if (toolName && PROTECTED_TOOLS.has(toolName)) return false;

    return true;
  });

  if (compactTargets.length === 0) {
    return messages;
  }

  for (const target of compactTargets) {
    const message = messages[target.messageIndex];
    if (!message || message.role !== "tool") continue;
    if (isAlreadyCompacted(message.content)) continue;

    const toolName = toolCallMap.get(target.toolCallId) || "tool";
    applyPlaceholder(message, createPlaceholder(toolName));
  }

  return messages;
}
