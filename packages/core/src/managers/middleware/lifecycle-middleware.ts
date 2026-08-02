/**
 * Run lifecycle middleware — usage tracking, run finalization, and stream side-effects.
 *
 * Status transitions live in {@link createStatusMiddleware}; this middleware owns
 * everything else that hooks into the agent run lifecycle.
 */

import { extractTanStackUsage } from "../../runtime-types/token-usage.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelPricing } from "../../models/types.js";
import type { AgentEventType, RunFinalizeReason, UsageTracker } from "../../runtime-types";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Lifecycle middleware
// ============================================================================

export interface LifecycleMiddlewareDeps {
  usage: UsageTracker;
  getPricing: () => ModelPricing | null | undefined;
  onThinking?: () => void;
  onFirstModelOutput?: () => void;
  onRunFinalize?: (reason: RunFinalizeReason, finishReason?: string | null) => void;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
}

export function createLifecycleMiddleware(deps: LifecycleMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  let memoryCommitted = false;
  let thinkingEmitted = false;
  let runFinalized = false;
  let startTime = 0;

  const finalizeOnce = (reason: RunFinalizeReason, finishReason?: string | null): void => {
    if (runFinalized) return;
    runFinalized = true;
    deps.onRunFinalize?.(reason, finishReason);
  };

  return {
    name: "lifecycle",
    onStart: (ctx) => {
      memoryCommitted = false;
      thinkingEmitted = false;
      runFinalized = false;
      startTime = Date.now();
      // llmRequestEmitted = false;

      deps.emitEvent?.("llm:request", {
        model: ctx.model,
        messagesCount: ctx.messages.length,
        toolsCount: ctx.toolNames?.length ?? 0,
      });
    },
    onChunk: (_ctx, chunk) => {
      if (
        !thinkingEmitted &&
        (chunk.type === "REASONING_MESSAGE_START" || chunk.type === "REASONING_MESSAGE_CONTENT")
      ) {
        thinkingEmitted = true;
        deps.onThinking?.();
      }

      if (!memoryCommitted && chunk.type === "TEXT_MESSAGE_CONTENT") {
        memoryCommitted = true;
        deps.onFirstModelOutput?.();
      }

      return chunk;
    },
    onUsage: (_ctx, usage) => {
      deps.usage.updateWindowUsage(extractTanStackUsage(usage), deps.getPricing());
    },
    onFinish: (_ctx, info) => {
      const elapsed = Date.now() - startTime;
      const windowUsage = deps.usage.getWindowUsage();
      deps.emitEvent?.("llm:response", {
        finishReason: info.finishReason,
        inputTokens: windowUsage.inputTokens,
        outputTokens: windowUsage.outputTokens,
        cacheReadTokens: windowUsage.cacheReadTokens ?? 0,
        cacheWriteTokens: windowUsage.cacheWriteTokens ?? 0,
        durationMs: elapsed,
      });
      finalizeOnce("finished", info.finishReason);
    },
    onAbort: () => {
      finalizeOnce("aborted");
    },
    onError: () => {
      finalizeOnce("error");
    },
  };
}
