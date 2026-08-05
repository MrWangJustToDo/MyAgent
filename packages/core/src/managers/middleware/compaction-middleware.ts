import { applyCompactionResult, autoCompact } from "../../agent/compaction";

import type { AgentContext } from "../../agent/agent-context";
import type { AgentLog } from "../../agent/agent-log";
import type { CompactionConfig } from "../../agent/compaction/types.js";
import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { TodoManager } from "../../agent/todo-manager";
import type { AgentEventType, AgentManager, AgentStatusController, UsageTracker } from "../../runtime-types";
import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

export interface CompactionMiddlewareDeps {
  agentId: string;
  manager: AgentManager;
  getCompactionConfig: () => CompactionConfig | null;
  getContext: () => AgentContext | null;
  getUsage: () => UsageTracker;
  getTodoManager: () => TodoManager | null;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
  status: AgentStatusController;
  log: AgentLog | null;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
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
      const agentContext = deps.getContext();

      if (!agentContext) {
        return { messages: engineMessages };
      }

      const canon = agentContext.getCanonicalModelMessages(engineMessages);
      let llmMessages = agentContext.getMessagesForLLM(canon);

      // DeepSeek reasoning echo is handled entirely in ReasoningChatCompletionsTextAdapter
      // (stream STEP_FINISHED.delta + toolCallId cache). Do not strip thinking here.

      const managed = deps.manager.getAgent(deps.agentId);
      const isSubagent = Boolean(managed?.parentId);

      if (!isSubagent && deps.shouldTriggerAutoCompact(llmMessages) && agentContext) {
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
            applyCompactionResult(canon, agentContext, usage, result, {
              onCacheCleanupError: (err) => {
                deps.emitEvent?.("compaction:auto-error", {
                  phase: "cache-cleanup",
                  error: err.message,
                });
              },
            })
          ) {
            managed?.resetAdmittedTurnContext();
            llmMessages = agentContext.getMessagesForLLM(canon);
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
