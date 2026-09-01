import { convertMessagesToModelMessages, type ChatMiddleware, type ModelMessage } from "@tanstack/ai";

import {
  applyCompactionResult,
  autoCompact,
  getModelVisibleMessages,
  isLatestDurableMessageCompactionSummary,
  keepPolicyProjectionOptions,
  policyKeyFromOptions,
  resolveKeepPolicy,
  WireProjectionCache,
  wireSourceFingerprint,
} from "../../agent/compaction";

import type { AgentLog } from "../../agent/agent-log";
import type { CompactionConfig } from "../../agent/compaction/types.js";
import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { TodoManager } from "../../agent/todo-manager";
import type { AgentUIChannel } from "../../agent/ui-channel.js";
import type { AgentManager, AgentStatusController, UsageTracker } from "../../runtime-types";
import type { EmitAgentTelemetryFn } from "../telemetry/emit-agent-telemetry.js";

export interface CompactionMiddlewareDeps {
  agentId: string;
  manager: AgentManager;
  getCompactionConfig: () => CompactionConfig | null;
  /** Model input context window in tokens, if known (drives keep policy + trigger). */
  getContextWindow?: () => number | undefined;
  getUIChannel: () => AgentUIChannel | null;
  getUsage: () => UsageTracker;
  getTodoManager: () => TodoManager | null;
  shouldTriggerAutoCompact: (messages?: ModelMessage[]) => boolean;
  status: AgentStatusController;
  log: AgentLog | null;
  emitEvent?: EmitAgentTelemetryFn;
}

function projectWireFromChannel(
  channel: AgentUIChannel,
  config: CompactionConfig | null,
  contextWindow: number | undefined,
  cache: WireProjectionCache
): ModelMessage[] {
  const policyOptions = keepPolicyProjectionOptions(resolveKeepPolicy(config ?? {}, contextWindow));
  const messages = channel.getMessages();
  const fingerprint = wireSourceFingerprint(channel.getRevision(), messages, policyKeyFromOptions(policyOptions));
  return cache.getOrCompute(fingerprint, () =>
    getModelVisibleMessages(convertMessagesToModelMessages(messages), policyOptions)
  );
}

/** TanStack compaction via {@link ChatMiddleware.onConfig}. */
export function createCompactionMiddleware(deps: CompactionMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  const wireCache = new WireProjectionCache();
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

      const compactionConfig = deps.getCompactionConfig();
      const contextWindow = deps.getContextWindow?.();
      // Always project from the live channel. Early tool results and compact
      // appends land on the channel before the next inner iteration.
      let llmMessages = projectWireFromChannel(channel, compactionConfig, contextWindow, wireCache);

      const managed = deps.manager.getAgent(deps.agentId);
      const isSubagent = Boolean(managed?.parentId);

      const alreadyCompacted = isLatestDurableMessageCompactionSummary(channel.getMessages());
      if (!isSubagent && !alreadyCompacted && deps.shouldTriggerAutoCompact(llmMessages)) {
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
          const fromChannel = convertMessagesToModelMessages(channel.getMessages());
          const result = await autoCompact(llmMessages, compactionConfig ?? {}, deps.agentId, deps.manager, {
            todos: todos.length > 0 ? todos : undefined,
            actualTokens: actualTokens || undefined,
            contextWindow,
          });

          if (
            applyCompactionResult(fromChannel, channel, usage, result, {
              ...keepPolicyProjectionOptions(resolveKeepPolicy(compactionConfig ?? {}, contextWindow)),
              onCacheCleanupError: (err) => {
                deps.emitEvent?.("compaction:auto-error", {
                  phase: "cache-cleanup",
                  error: err.message,
                });
              },
            })
          ) {
            managed?.resetAdmittedTurnContext();
            wireCache.invalidate();
            llmMessages = projectWireFromChannel(channel, compactionConfig, contextWindow, wireCache);
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
