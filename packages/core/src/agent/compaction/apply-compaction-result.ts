/**
 * Apply a successful autoCompact result to AgentContext.
 * Shared by prepareStep auto-compaction and CLI /compact.
 */

import { cleanupOrphanedToolCache } from "../tools/util/tool-output-cache.js";

import { createCompactedMessages } from "./auto-compact.js";

import type { CompactionResult } from "./types.js";
import type { Sandbox } from "../../environment/types.js";
import type { AgentContext } from "../agent-context/agent-context.js";

export interface ApplyCompactionResultOptions {
  /** Called if orphaned tool-cache cleanup fails (non-fatal). */
  onCacheCleanupError?: (error: Error) => void;
}

/**
 * Update context after compaction: summary, compactIndex, usage reset, tool history, cache cleanup.
 *
 * @returns true if result was applied; false if nothing to apply (not compacted or missing cut)
 */
export function applyCompactionResult(
  context: AgentContext,
  sandbox: Sandbox,
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
  context.resetUsage();
  context.clearTools();

  const allMessages = context.getMessages();
  cleanupOrphanedToolCache(sandbox, allMessages, absoluteCut).catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    options?.onCacheCleanupError?.(error);
  });

  return true;
}
