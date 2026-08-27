/**
 * Run lifecycle middleware — usage tracking and stream side-effects.
 *
 * Status transitions live in {@link createStatusMiddleware}.
 * Turn-level finalization (`finalizeRun`: clear turn context, `agent:stop`, memory extract)
 * is owned by {@link AgentChatController.pumpToolPhases} / detached runners — not per-`chat()` finish.
 */

import { extractTanStackUsage } from "../../runtime-types/token-usage.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelPricing } from "../../models/types.js";
import type { UsageTracker } from "../../runtime-types";
import type { EmitAgentTelemetryFn } from "../emit-agent-telemetry.js";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Lifecycle middleware
// ============================================================================

export interface LifecycleMiddlewareDeps {
  usage: UsageTracker;
  getPricing: () => ModelPricing | null | undefined;
  onThinking?: () => void;
  onFirstModelOutput?: () => void;
  emitEvent?: EmitAgentTelemetryFn;
}

export function createLifecycleMiddleware(deps: LifecycleMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  let memoryCommitted = false;
  let thinkingEmitted = false;
  let startTime = 0;
  let callOutputTokens = 0;

  return {
    name: "lifecycle",
    onStart: (ctx) => {
      memoryCommitted = false;
      thinkingEmitted = false;
      callOutputTokens = 0;
      startTime = Date.now();

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
      const parsed = extractTanStackUsage(usage);
      // Per-call output tokens (this request only), used for the tok/s basis.
      callOutputTokens = parsed.outputTokens;
      deps.usage.updateWindowUsage(parsed, deps.getPricing());
    },
    onFinish: (_ctx, info) => {
      const elapsed = Date.now() - startTime;
      // Feed measured LLM duration + output tokens into the usage tracker so
      // `/usage` can show an average generation rate (tok/s).
      deps.usage.addLlmCall(elapsed, callOutputTokens);
      const windowUsage = deps.usage.getWindowUsage();
      deps.emitEvent?.("llm:response", {
        finishReason: info.finishReason ?? undefined,
        inputTokens: windowUsage.inputTokens,
        outputTokens: windowUsage.outputTokens,
        cacheReadTokens: windowUsage.cacheReadTokens ?? 0,
        cacheWriteTokens: windowUsage.cacheWriteTokens ?? 0,
        durationMs: elapsed,
      });
    },
  };
}
