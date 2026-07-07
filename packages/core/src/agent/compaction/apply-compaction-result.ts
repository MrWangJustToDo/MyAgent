/**
 * Apply a successful autoCompact result to AgentContext.
 * Shared by prepareStep auto-compaction and CLI /compact.
 */

import { cleanupOrphanedToolCache } from "../tools/util/tool-output-cache.js";

import { createCompactedMessages } from "./auto-compact.js";

import type { CompactionResult } from "./types.js";
import type { UsageTracker } from "../../managers/usage-tracker.js";
import type { AgentContext } from "../agent-context/agent-context.js";
import type { ModelMessage } from "@tanstack/ai";

export interface ApplyCompactionResultOptions {
  /** Called if orphaned tool-cache cleanup fails (non-fatal). */
  onCacheCleanupError?: (error: Error) => void;
}

/**
 * Update context after compaction: summary, compactIndex, window usage reset, cache cleanup.
 *
 * @returns true if result was applied; false if nothing to apply (not compacted or missing cut)
 */
export function applyCompactionResult(
  context: AgentContext,
  usage: UsageTracker,
  result: CompactionResult,
  options?: ApplyCompactionResultOptions
): boolean {
  if (!result.compacted || !result.summary || result.cutIndex == null) {
    return false;
  }

  const summaryMsg = createCompactedMessages(result.summary)[0];
  context.setSummaryMessage(summaryMsg);
  const absoluteCut = context.getCompactIndex() + result.cutIndex;
  context.setCompactIndex(absoluteCut);
  usage.resetWindow();

  const allMessages = context.getMessages();
  cleanupOrphanedToolCache(allMessages, absoluteCut).catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    options?.onCacheCleanupError?.(error);
  });

  return true;
}

/**
 * Apply reactive compaction output (summary + tail messages) to context.
 */
export function applyReactiveCompactionResult(
  context: AgentContext,
  usage: UsageTracker,
  compactedMessages: ModelMessage[],
  options?: ApplyCompactionResultOptions
): boolean {
  if (compactedMessages.length === 0) return false;

  const summaryMsg = compactedMessages[0];
  if (!summaryMsg) return false;

  context.setSummaryMessage(summaryMsg);
  const oldCompactIndex = context.getCompactIndex();
  const newCompactIndex = context.getMessages().length;
  context.setCompactIndex(newCompactIndex);

  if (newCompactIndex > oldCompactIndex) {
    cleanupOrphanedToolCache(context.getMessages(), newCompactIndex).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      options?.onCacheCleanupError?.(error);
    });
  }

  const tailMessages = compactedMessages.slice(1);
  if (tailMessages.length > 0) {
    const allMessages = [...context.getMessages(), ...tailMessages];
    context.setMessages(allMessages);
    context.setCompactIndex(allMessages.length - tailMessages.length);
  }

  usage.resetWindow();
  return true;
}
