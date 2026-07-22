/**
 * Reactive compaction helpers for {@link ManagedAgent}.
 */

import { applyReactiveCompactionResult } from "../agent/compaction/apply-compaction-result.js";
import { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";

import type { AgentEventType } from "./agent-event-bus.js";
import type { AgentStatusController } from "./agent-status-controller.js";
import type { AgentManager } from "./manager-agent.js";
import type { RunCoordinator } from "./run-coordinator.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";

export interface ReactiveCompactHost {
  id: string;
  parentId?: string;
  context: AgentContext;
  usage: UsageTracker;
  run: RunCoordinator;
  statusController: AgentStatusController;
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
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

  const retry = host.run.recordReactiveCompactRetry();

  try {
    host.statusController.beginCompaction("reactive", {
      retry,
      maxRetries: host.run.getMaxReactiveCompactRetries(),
    });
    const canon = host.context.getCanonicalFromUI();
    const llmMessages = host.context.getMessagesForLLM(canon);
    const compactedMessages = await reactiveCompact(llmMessages, host.id, manager);

    applyReactiveCompactionResult(canon, host.context, host.usage, compactedMessages, {
      onCacheCleanupError: (err) => {
        host.emitEvent("compaction:reactive-error", {
          phase: "cache-cleanup",
          error: err.message,
        });
      },
    });

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
