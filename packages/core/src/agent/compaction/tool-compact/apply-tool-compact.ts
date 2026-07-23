import { deleteToolOutputCacheFile } from "../../tools/util/tool-output-cache.js";
import { buildToolCallNameMap, getToolMessageContentSize } from "../message-utils.js";

import { buildToolCallInputMap } from "./build-tool-call-input-map.js";
import {
  extractCachedOutputPath,
  formatToolErrorForModel,
  isPendingToolExecutionResult,
  isToolErrorResult,
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
  if (isToolErrorResult(rawOutput)) return false;

  return true;
}

/**
 * Message index of the first tool result that must stay in the recent window.
 * Everything at/after this index is never placeholder-compressed.
 *
 * Counts **non-placeholder** tool results from the end so already-compressed
 * slots do not consume the keep quota (avoids cascading loss of full results).
 *
 * Returns `-1` when fewer than `keepRecentToolResults` full results exist
 * (compress nothing). Returns `+Infinity` when keep is 0 (compress all eligible).
 */
function getRecentKeepBoundary(
  toolResults: ToolResultRef[],
  messages: ModelMessage[],
  keepRecentToolResults: number
): number {
  if (keepRecentToolResults <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let keptFull = 0;
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const message = messages[toolResults[i]!.messageIndex];
    if (!message || message.role !== "tool") continue;
    if (isToolPlaceholder(message.content)) continue;

    keptFull += 1;
    if (keptFull === keepRecentToolResults) {
      return toolResults[i]!.messageIndex;
    }
  }

  // Not enough full results to fill the window — do not placeholder-compress more.
  return -1;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform tool results for the LLM path:
 *
 * Two-layer approach:
 * 1. **Placeholder replacement** (threshold-triggered):
 *    Tool results **before** the last `keepRecentToolResults` *full*
 *    (non-placeholder) results may be compressed into
 *    `[Previous: used toolName]` when eligible.
 *    The recent window is a hard boundary — skipped older results (small /
 *    protected / pending) must not cause compression to eat into recent ones.
 *    Already-placeholder slots do not consume the keep quota.
 *    Once compressed, placeholders stay compressed — no re-expansion.
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
  const { keepRecentToolResults = 100, minToolResultSize = 100 } = options.config ?? {};
  const cache = options.cache;
  const toolResults = findToolResultMessages(messages);

  if (toolResults.length === 0) {
    return;
  }

  const toolCallMap = buildToolCallNameMap(messages);
  const toolInputMap = buildToolCallInputMap(messages);

  // ── Phase 1: Placeholder compression before the recent-window boundary ──
  const keepBoundary = getRecentKeepBoundary(toolResults, messages, keepRecentToolResults);

  if (keepBoundary !== -1) {
    for (const target of toolResults) {
      // Hard stop: never placeholder-compress the recent window.
      if (Number.isFinite(keepBoundary) && target.messageIndex >= keepBoundary) break;

      const message = messages[target.messageIndex];
      if (!message || message.role !== "tool") continue;

      const toolName = toolCallMap.get(target.toolCallId) ?? "tool";
      if (!isToolCompressible(target, message, toolName, minToolResultSize)) continue;

      await cleanupToolCachesForMessage(message, target.toolCallId, cache);
      applyToolPlaceholder(message, createToolPlaceholder(toolName));
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

    const cached = cache.get(target.toolCallId);
    if (cached !== undefined) {
      applyModelToolContent(message, cached);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – approved check on raw output
    if (rawOutput?.approved === false) continue;

    if (isToolErrorResult(rawOutput)) {
      const normalized = normalizeModelToolContent(formatToolErrorForModel(rawOutput));
      cache.set(target.toolCallId, normalized);
      message.content = normalized;
      continue;
    }

    const toModelOutput = options.registry.get(toolName);
    if (!toModelOutput) continue;
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
