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

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform tool results for the LLM path:
 * - Outside the recent window → placeholder + cache cleanup
 * - Inside the window with `toModelOutput` → cached transformed content
 * - Inside the window without handler → pass through unchanged
 */
export async function applyToolCompact(messages: ModelMessage[], options: ApplyToolCompactOptions): Promise<void> {
  const { keepRecentToolResults = 60, minToolResultSize = 100 } = options.config ?? {};
  const toolResults = findToolResultMessages(messages);

  if (toolResults.length === 0) {
    return;
  }

  const toolCallMap = buildToolCallNameMap(messages);
  const toolInputMap = buildToolCallInputMap(messages);
  const recentIds = new Set(
    toolResults.slice(Math.max(0, toolResults.length - keepRecentToolResults)).map((ref) => ref.toolCallId)
  );

  for (const target of toolResults) {
    const message = messages[target.messageIndex];
    if (!message || message.role !== "tool") continue;
    if (isToolPlaceholder(message.content)) continue;

    const toolName = toolCallMap.get(target.toolCallId) ?? "tool";
    const rawOutput = parseToolMessageOutput(message.content);

    // Approved-but-not-yet-executed placeholder from uiMessageToModelMessages — leave intact.
    if (isPendingToolExecutionResult(rawOutput)) continue;

    if (!recentIds.has(target.toolCallId)) {
      if (target.size < minToolResultSize) continue;
      if (PROTECTED_TOOLS.has(toolName)) continue;

      await cleanupToolCachesForMessage(message, target.toolCallId, options.cache);
      applyToolPlaceholder(message, createToolPlaceholder(toolName));
      continue;
    }

    const toModelOutput = options.registry.get(toolName);
    if (!toModelOutput) continue;

    const cached = options.cache.get(target.toolCallId);
    if (cached !== undefined) {
      applyModelToolContent(message, cached);
      continue;
    }

    // denied tool result, skip compacting
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (rawOutput?.approved === false) continue;
    const input = toolInputMap.get(target.toolCallId);
    const transformed = await toModelOutput({
      toolCallId: target.toolCallId,
      input,
      output: rawOutput,
    });

    const normalized = normalizeModelToolContent(transformed);
    options.cache.set(target.toolCallId, normalized);
    message.content = normalized;
  }
}
