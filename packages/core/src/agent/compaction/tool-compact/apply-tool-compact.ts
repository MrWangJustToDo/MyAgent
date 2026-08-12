import { buildToolCallNameMap } from "../message-utils.js";

import { buildToolCallInputMap } from "./build-tool-call-input-map.js";
import {
  formatToolErrorForModel,
  isPendingToolExecutionResult,
  isToolErrorResult,
  normalizeModelToolContent,
  parseToolMessageOutput,
} from "./parse-tool-message.js";

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
}

export interface ApplyToolCompactOptions {
  /** Reserved for future tool-compact options; currently unused. */
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
    });
  }

  return results;
}

function applyModelToolContent(message: ModelMessage, content: unknown): void {
  message.content = normalizeModelToolContent(content);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Transform tool results for the LLM path.
 *
 * Only {@link toModelOutput} formatting runs (cached per `toolCallId`).
 */
export async function applyToolCompact(messages: ModelMessage[], options: ApplyToolCompactOptions): Promise<void> {
  const cache = options.cache;
  const toolResults = findToolResultMessages(messages);

  if (toolResults.length === 0) {
    return;
  }

  const toolCallMap = buildToolCallNameMap(messages);
  const toolInputMap = buildToolCallInputMap(messages);

  for (const target of toolResults) {
    const message = messages[target.messageIndex];
    if (!message || message.role !== "tool") continue;

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
