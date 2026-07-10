import { applyCompactionResult, autoCompact } from "../compaction";

import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { AgentStatusController } from "../../managers/agent-status-controller.js";
import type { AgentManager } from "../../managers/manager-agent.js";
import type { UsageTracker } from "../../managers/usage-tracker.js";
import type { ModelInfo } from "../../models/types.js";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig } from "../compaction/types.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { TodoManager } from "../todo-manager";
import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

export interface CompactionMiddlewareDeps {
  agentId: string;
  manager: AgentManager;
  getCompactionConfig: () => CompactionConfig | null;
  getContext: () => AgentContext | null;
  getUsage: () => UsageTracker;
  getTodoManager: () => TodoManager | null;
  getModelInfo: () => ModelInfo | null;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
  status: AgentStatusController;
  log: AgentLog | null;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
}

function shouldStripReasoningForPrefixCache(modelInfo: ModelInfo | null): boolean {
  if (!modelInfo) return false;
  if (modelInfo.capabilities.includes("reasoning")) return false;
  return true;
}

function stripReasoningFromHistory(messages: ModelMessage[], modelInfo: ModelInfo | null): void {
  if (!shouldStripReasoningForPrefixCache(modelInfo)) return;

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;

    const hasToolCall = (msg.toolCalls?.length ?? 0) > 0;
    if (hasToolCall) continue;

    if (msg.thinking && msg.thinking.length > 0) {
      msg.thinking = [];
    }
  }
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

      stripReasoningFromHistory(llmMessages, deps.getModelInfo());

      const managed = deps.manager.getAgent(deps.agentId);
      const isSubagent = Boolean(managed?.parentId);

      if (!isSubagent && deps.shouldTriggerAutoCompact(llmMessages) && agentContext) {
        try {
          deps.status.beginCompaction();

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
            llmMessages = agentContext.getMessagesForLLM(canon);
          }

          deps.log?.agent("compact result", { result, canon, llmMessages });

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
