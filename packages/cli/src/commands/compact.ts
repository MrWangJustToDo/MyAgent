import { applyCompactionResult, autoCompact, estimateTokens } from "@my-agent/core";

import { registerCommand } from "./registry.js";

registerCommand({
  name: "compact",
  description: "Compress conversation context to reduce token usage",
  usage: "/compact [focus]",
  immediate: true,
  execute: async (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const context = agent.getContext();
    if (!context) {
      return { ok: false, error: "Agent context not available" };
    }

    const messages = context.getMessagesForLLM();
    if (messages.length === 0) {
      return { ok: false, error: "No messages to compact" };
    }

    const sandbox = agent.getSandbox();
    if (!sandbox) {
      return { ok: false, error: "Sandbox not available" };
    }

    const focus = args.trim() || undefined;

    const todoManager = agent.getTodoManager();
    const incompleteTodos = todoManager?.getIncompleteTodos() ?? [];
    const todos = incompleteTodos.map((t) => ({
      content: t.content,
      status: t.status as "pending" | "in_progress" | "completed",
      priority: t.priority as "high" | "medium" | "low",
    }));

    const previousStatus = agent.status;
    const tokensBeforeEstimate = estimateTokens(messages);
    const actualTokens = context.getUsage().inputTokens ?? 0;

    agent.status = "compacting";

    try {
      const result = await autoCompact(messages, agent.compactionConfig || {}, agent.id, sandbox, {
        focus,
        todos: todos.length > 0 ? todos : undefined,
        actualTokens: actualTokens || undefined,
      });

      const applied = applyCompactionResult(context, sandbox, result, {
        onCacheCleanupError: (err) => {
          agent.getLog()?.warn("agent", "Failed to cleanup tool cache after /compact", { error: err.message });
        },
      });

      if (!applied) {
        if (result.error) {
          return { ok: false, error: result.error };
        }
        return {
          ok: true,
          message:
            "Nothing to compact — not enough older conversation to summarize (increase keepRecentFlows or add more history).",
        };
      }

      const tokensBefore = result.tokensBefore ?? tokensBeforeEstimate;
      const compressionRatio = tokensBefore > 0 ? Math.round((1 - result.tokensAfter / tokensBefore) * 100) : 0;
      const todoNote = incompleteTodos.length > 0 ? ` (${incompleteTodos.length} todos preserved)` : "";

      return {
        ok: true,
        message: `Compacted: ${tokensBefore} → ${result.tokensAfter} tokens (${compressionRatio}% reduction)${todoNote}`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { ok: false, error: `Compaction failed: ${err.message}` };
    } finally {
      agent.status = previousStatus;
    }
  },
});
