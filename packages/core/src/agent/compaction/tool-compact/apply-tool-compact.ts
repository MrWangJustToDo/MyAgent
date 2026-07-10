import { deleteToolOutputCacheFile } from "../../tools/util/tool-output-cache.js";
import { buildToolCallNameMap, getToolMessageContentSize } from "../message-utils.js";

import { buildToolCallInputMap } from "./build-tool-call-input-map.js";
import {
  extractCachedOutputPath,
  isPendingToolExecutionResult,
  normalizeModelToolContent,
  parseToolMessageOutput,
} from "./parse-tool-message.js";
import {
  applyToolPlaceholder,
  createToolPlaceholder,
  isToolPlaceholder,
  PROTECTED_TOOLS,
} from "./tool-compact-placeholders.js";

import type { ToolCompactCache } from "./tool-compact-cache.js";
import type { ToModelOutputRegistry } from "./types.js";
import type { CompactionConfig } from "../types.js";
import type { ModelMessage } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

interface ToolResultRef {
  messageIndex: number;
  toolCallId: string;
  size: number;
}

export interface ApplyToolCompactOptions {
  config?: Partial<CompactionConfig>;
  registry: Pick<ToModelOutputRegistry, "get">;
  cache: ToolCompactCache;
}

// ============================================================================
// Helpers
// ============================================================================

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

function applyModelToolContent(message: ModelMessage, content: unknown): void {
  message.content = normalizeModelToolContent(content);
}

async function cleanupToolCachesForMessage(
  message: ModelMessage,
  toolCallId: string,
  cache: ToolCompactCache
): Promise<void> {
  cache.delete(toolCallId);

  const output = parseToolMessageOutput(message.content);
  const cachedPath = extractCachedOutputPath(output);
  if (cachedPath) {
    await deleteToolOutputCacheFile(cachedPath);
  }
}

/**
 * Count tool results eligible for toModelOutput or placeholder replacement.
 * Skips messages that are already placeholders or pending execution.
 */
function countNonPlaceholderToolResults(toolResults: ToolResultRef[], messages: ModelMessage[]): number {
  let count = 0;
  for (const target of toolResults) {
    const message = messages[target.messageIndex];
    if (!message || message.role !== "tool") continue;
    if (isToolPlaceholder(message.content)) continue;
    count++;
  }
  return count;
}

/**
 * Deterministic check: is this tool result compressible into a placeholder?
 * (non-protected, not pending, above minimum size)
 */
function isToolCompressible(
  target: ToolResultRef,
  message: ModelMessage,
  toolName: string,
  minToolResultSize: number
): boolean {
  if (isToolPlaceholder(message.content)) return false;
  if (PROTECTED_TOOLS.has(toolName)) return false;
  if (target.size < minToolResultSize) return false;

  const rawOutput = parseToolMessageOutput(message.content);
  if (isPendingToolExecutionResult(rawOutput)) return false;

  return true;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform tool results for the LLM path:
 *
 * Two-layer approach:
 * 1. **Placeholder replacement** (threshold-triggered):
 *    When non-placeholder tool results exceed `keepRecentToolResults`,
 *    compress the oldest eligible results into short `[Previous: used toolName]`
 *    placeholders. Once compressed, they stay compressed — no re-expansion.
 *
 * 2. **toModelOutput formatting** (always applied):
 *    Every non-placeholder tool result passes through its registered
 *    `toModelOutput` function for LLM-friendly formatting. Results are
 *    cached per `toolCallId` so the transformation runs only once.
 *
 * Compared to the old sliding-window approach, this design guarantees a
 * stable message prefix across iterations (after the initial threshold
 * trigger), enabling AI service prompt caching to hit.
 */
export async function applyToolCompact(messages: ModelMessage[], options: ApplyToolCompactOptions): Promise<void> {
  const { keepRecentToolResults = 60, minToolResultSize = 100 } = options.config ?? {};
  const cache = options.cache;
  const toolResults = findToolResultMessages(messages);

  if (toolResults.length === 0) {
    return;
  }

  const toolCallMap = buildToolCallNameMap(messages);
  const toolInputMap = buildToolCallInputMap(messages);

  // ── Phase 1: Threshold-triggered placeholder compression ──
  // If non-placeholder tool results exceed the configured limit, compress
  // the oldest eligible results into placeholders in one shot.
  const nonPlaceholderCount = countNonPlaceholderToolResults(toolResults, messages);
  const compressTarget = nonPlaceholderCount - keepRecentToolResults;

  if (compressTarget > 0) {
    let compressed = 0;

    for (const target of toolResults) {
      if (compressed >= compressTarget) break;

      const message = messages[target.messageIndex];
      if (!message || message.role !== "tool") continue;

      const toolName = toolCallMap.get(target.toolCallId) ?? "tool";
      if (!isToolCompressible(target, message, toolName, minToolResultSize)) continue;

      await cleanupToolCachesForMessage(message, target.toolCallId, cache);
      applyToolPlaceholder(message, createToolPlaceholder(toolName));
      compressed++;
    }
  }

  // ── Phase 2: toModelOutput formatting (always applied, cached) ──
  // Every tool result that is NOT a placeholder gets its registered
  // toModelOutput transformation applied. Results are cached per toolCallId
  // so each transformation runs only once across all iterations.
  for (const target of toolResults) {
    const message = messages[target.messageIndex];
    if (!message || message.role !== "tool") continue;
    if (isToolPlaceholder(message.content)) continue;

    const toolName = toolCallMap.get(target.toolCallId) ?? "tool";
    const rawOutput = parseToolMessageOutput(message.content);
    if (isPendingToolExecutionResult(rawOutput)) continue;

    const toModelOutput = options.registry.get(toolName);
    if (!toModelOutput) continue;

    const cached = cache.get(target.toolCallId);
    if (cached !== undefined) {
      applyModelToolContent(message, cached);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – approved check on raw output
    if (rawOutput?.approved === false) continue;
    const input = toolInputMap.get(target.toolCallId);
    const transformed = await toModelOutput({
      toolCallId: target.toolCallId,
      input,
      output: rawOutput,
    });

    const normalized = normalizeModelToolContent(transformed);
    cache.set(target.toolCallId, normalized);
    message.content = normalized;
  }
}
