/**
 * Reactive compaction helpers for {@link ManagedAgent}.
 */

import { applyReactiveCompactionResult } from "../agent/compaction/apply-compaction-result.js";
import { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";

import type { AgentEventType } from "./agent-event-bus.js";
import type { AgentManager } from "./agent-manager.js";
import type { AgentStatusController } from "./agent-status-controller.js";
import type { RunCoordinator } from "./run-coordinator.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { ModelMessage } from "@tanstack/ai";

export interface ReactiveCompactHost {
  id: string;
  parentId?: string;
  ui?: AgentUIChannel;
  usage: UsageTracker;
  run: RunCoordinator;
  statusController: AgentStatusController;
  getCanonicalFromUI: () => ModelMessage[];
  getMessagesForLLM: (canon?: ModelMessage[]) => ModelMessage[];
  setRunBaselineCount: (count: number) => void;
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
  resetAdmittedTurnContext?: () => void;
  compactionConfig?: { keepRecentFlows?: number } | null;
}

export async function handleManagedReactiveCompact(
  host: ReactiveCompactHost,
  error: unknown,
  manager: AgentManager
): Promise<boolean> {
  if (host.parentId) return false;
  if (!isPromptTooLongError(error)) return false;
  if (!host.run.canRetryReactiveCompact()) {
    host.emitEvent("compaction:reactive-max-retries");
    return false;
  }

  const channel = host.ui;
  if (!channel) return false;

  const retry = host.run.recordReactiveCompactRetry();

  try {
    host.statusController.beginCompaction("reactive", {
      retry,
      maxRetries: host.run.getMaxReactiveCompactRetries(),
    });
    const canon = host.getCanonicalFromUI();
    const llmMessages = host.getMessagesForLLM(canon);
    const compactedMessages = await reactiveCompact(llmMessages, host.id, manager);

    applyReactiveCompactionResult(canon, channel, host.usage, compactedMessages, {
      keepRecentFlows: host.compactionConfig?.keepRecentFlows ?? 2,
      onCacheCleanupError: (err) => {
        host.emitEvent("compaction:reactive-error", {
          phase: "cache-cleanup",
          error: err.message,
        });
      },
    });
    host.resetAdmittedTurnContext?.();
    // Recovery retries chat() without prepareForRun; UI stays chronological while
    // the next onConfig projects summary-first onto the engine — prefer engine.
    host.setRunBaselineCount(Number.MAX_SAFE_INTEGER);

    host.emitEvent("compaction:reactive-complete", {
      originalCount: llmMessages.length,
      compactedCount: compactedMessages.length,
      originalTokens: host.usage.getWindowUsage().inputTokens,
    });

    host.statusController.endCompaction();
    return true;
  } catch (err) {
    const compactError = err instanceof Error ? err : new Error(String(err));
    host.emitEvent("compaction:reactive-error", { error: compactError.message });
    return false;
  }
}
