/**
 * Micro Compaction (Layer 1) - Replace old tool results with placeholders.
 *
 * This runs automatically before each LLM call and provides gradual compression
 * by replacing old tool_result content with `[Previous: used {tool_name}]` placeholders.
 *
 * Rules:
 * - Preserves the N most recent tool results (configurable)
 * - Skips small tool results (< minToolResultSize characters)
 * - Tracks tool_use_id to tool_name mapping for placeholder text
 *
 * Uses Vercel AI SDK's ModelMessage type directly.
 */

import type { CompactionConfig } from "./types.js";
import type { ModelMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

/**
 * Tools whose results should never be pruned/compacted.
 * These contain important context that should always be preserved.
 */
const PROTECTED_TOOLS = new Set(["skill", "load_skill", "compact"]);

// ============================================================================
// Types
// ============================================================================

/**
 * Mapping of tool call IDs to tool names.
 */
type ToolCallMap = Map<string, string>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the string length of a tool result's output.
 */
function getToolResultSize(result: unknown): number {
  if (result === null || result === undefined) {
    return 0;
  }
  if (typeof result === "string") {
    return result.length;
  }
  try {
    return JSON.stringify(result).length;
  } catch {
    return 0;
  }
}

/**
 * Create a placeholder for a compacted tool result.
 */
function createPlaceholder(toolName: string): string {
  return `[Previous: used ${toolName}]`;
}

/**
 * Check if a part is a tool call.
 */
function isToolCallPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as Record<string, unknown>;
  return p.type === "tool-call";
}

/**
 * Check if a part is a tool result.
 */
function isToolResultPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as Record<string, unknown>;
  return p.type === "tool-result";
}

/**
 * Build a map of tool call IDs to tool names from messages.
 */
function buildToolCallMap(messages: ModelMessage[]): ToolCallMap {
  const map: ToolCallMap = new Map();

  for (const message of messages) {
    const content = message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (isToolCallPart(part)) {
          const p = part as Record<string, unknown>;
          const id = p.toolCallId as string | undefined;
          const name = p.toolName as string | undefined;
          if (id && name) {
            map.set(id, name);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Find all tool result indices in the messages array.
 * Returns array of { messageIndex, partIndex, toolCallId, size }
 */
function findToolResults(
  messages: ModelMessage[]
): Array<{ messageIndex: number; partIndex: number; toolCallId: string; size: number }> {
  const results: Array<{ messageIndex: number; partIndex: number; toolCallId: string; size: number }> = [];

  for (let mi = 0; mi < messages.length; mi++) {
    const message = messages[mi];
    const content = message.content;
    if (Array.isArray(content)) {
      for (let pi = 0; pi < content.length; pi++) {
        const part = content[pi];
        if (isToolResultPart(part)) {
          const p = part as Record<string, unknown>;
          results.push({
            messageIndex: mi,
            partIndex: pi,
            toolCallId: (p.toolCallId as string) || "",
            size: getToolResultSize(p.result),
          });
        }
      }
    }
  }

  return results;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply micro compaction to messages.
 *
 * Replaces old tool_result content with placeholders while preserving
 * recent tool results and small results.
 *
 * @param messages - Array of messages to compact (Vercel AI SDK ModelMessage[])
 * @param config - Compaction configuration
 * @returns New array of messages with compacted tool results
 *
 * @example
 * ```typescript
 * const compacted = microCompact(messages, {
 *   keepRecentToolResults: 3,
 *   minToolResultSize: 100,
 * });
 * ```
 */
export function microCompact(messages: ModelMessage[], config: Partial<CompactionConfig> = {}): ModelMessage[] {
  const { keepRecentToolResults = 3, minToolResultSize = 100 } = config;

  // Build tool call ID to name mapping
  const toolCallMap = buildToolCallMap(messages);

  // Find all tool results
  const toolResults = findToolResults(messages);

  // If we have fewer results than the keep threshold, nothing to compact
  if (toolResults.length <= keepRecentToolResults) {
    return messages;
  }

  // Determine which tool results to compact (oldest ones, excluding recent N)
  const toCompact = toolResults.slice(0, toolResults.length - keepRecentToolResults);

  // Filter out small results and protected tools
  const compactTargets = toCompact.filter((tr) => {
    // Don't compact small results
    if (tr.size < minToolResultSize) return false;

    // Don't compact protected tools (skill, load_skill, compact)
    const toolName = toolCallMap.get(tr.toolCallId);
    if (toolName && PROTECTED_TOOLS.has(toolName)) return false;

    return true;
  });

  // If nothing to compact after filtering, return original
  if (compactTargets.length === 0) {
    return messages;
  }

  // Create a deep copy and apply compaction
  const compacted = JSON.parse(JSON.stringify(messages)) as ModelMessage[];

  for (const target of compactTargets) {
    const message = compacted[target.messageIndex];
    const content = message.content;
    if (Array.isArray(content)) {
      const part = content[target.partIndex] as Record<string, unknown>;

      // Get tool name from map or use generic placeholder
      const toolName = toolCallMap.get(target.toolCallId) || (part.toolName as string) || "tool";

      // Replace result with placeholder
      part.result = createPlaceholder(toolName);
    }
  }

  return compacted;
}
