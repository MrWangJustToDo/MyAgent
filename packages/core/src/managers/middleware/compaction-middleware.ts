import { convertMessagesToModelMessages, type ChatMiddleware, type ModelMessage } from "@tanstack/ai";

import { applyCompactionResult, autoCompact, getModelVisibleMessages } from "../../agent/compaction";
import { buildCanonicalModelMessages } from "../../agent/compaction/build-canonical-model-messages.js";

import type { AgentLog } from "../../agent/agent-log";
import type { CompactionConfig } from "../../agent/compaction/types.js";
import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { TodoManager } from "../../agent/todo-manager";
import type { AgentUIChannel } from "../../agent/ui-channel.js";
import type { AgentManager, AgentStatusController, UsageTracker } from "../../runtime-types";
import type { EmitAgentTelemetryFn } from "../emit-agent-telemetry.js";

export interface CompactionMiddlewareDeps {
  agentId: string;
  manager: AgentManager;
  getCompactionConfig: () => CompactionConfig | null;
  getUIChannel: () => AgentUIChannel | null;
  getRunBaselineCount: () => number;
  /** Update baseline after channel-mutating compact so later merges stay coherent. */
  setRunBaselineCount?: (count: number) => void;
  getUsage: () => UsageTracker;
  getTodoManager: () => TodoManager | null;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
  status: AgentStatusController;
  log: AgentLog | null;
  emitEvent?: EmitAgentTelemetryFn;
}

/** TanStack compaction via {@link ChatMiddleware.onConfig}. */
export function createCompactionMiddleware(deps: CompactionMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "compaction",
    onIteration: () => {
      deps.getTodoManager()?.incrementRound();
    },
    onConfig: async (_ctx, config) => {
      const engineMessages = config.messages as ModelMessage[];
      const channel = deps.getUIChannel();

      if (!channel) {
        return { messages: engineMessages };
      }

      const keepRecentFlows = deps.getCompactionConfig()?.keepRecentFlows ?? 2;
      const canon = buildCanonicalModelMessages(channel.getMessages(), engineMessages, deps.getRunBaselineCount());
      let llmMessages = getModelVisibleMessages(canon, { keepRecentFlows });

      const managed = deps.manager.getAgent(deps.agentId);
      const isSubagent = Boolean(managed?.parentId);

      if (!isSubagent && deps.shouldTriggerAutoCompact(llmMessages)) {
        try {
          deps.status.beginCompaction("auto");

          const incompleteTodos = deps.getTodoManager()?.getIncompleteTodos() ?? [];
          const todos = incompleteTodos.map((t) => ({
            content: t.content,
            status: t.status as "pending" | "in_progress" | "completed",
            priority: t.priority as "high" | "medium" | "low",
          }));

          const usage = deps.getUsage();
          const actualTokens = usage.getWindowUsage().inputTokens ?? 0;
          const result = await autoCompact(llmMessages, deps.getCompactionConfig() ?? {}, deps.agentId, deps.manager, {
            todos: todos.length > 0 ? todos : undefined,
            actualTokens: actualTokens || undefined,
          });

          if (
            applyCompactionResult(canon, channel, usage, result, {
              keepRecentFlows,
              onCacheCleanupError: (err) => {
                deps.emitEvent?.("compaction:auto-error", {
                  phase: "cache-cleanup",
                  error: err.message,
                });
              },
            })
          ) {
            managed?.resetAdmittedTurnContext();
            // Append grows the channel; TanStack then replaces engine with the
            // summary-first wire (applyMiddlewareConfig). UI (chronological) and
            // engine (projected) no longer share an index space — force the
            // engine-prefer path until the next prepareForRun resets baseline.
            const fromChannel = convertMessagesToModelMessages(channel.getMessages());
            llmMessages = getModelVisibleMessages(fromChannel, { keepRecentFlows });
            deps.setRunBaselineCount?.(Number.MAX_SAFE_INTEGER);
          }

          if (result.compacted) {
            deps.emitEvent?.("compaction:auto-complete", {
              tokensBefore: result.tokensBefore,
              tokensAfter: result.tokensAfter,
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          deps.emitEvent?.("compaction:auto-error", { error: error.message });
        } finally {
          deps.status.endCompaction();
        }
      }

      return { messages: llmMessages };
    },
  };
}
