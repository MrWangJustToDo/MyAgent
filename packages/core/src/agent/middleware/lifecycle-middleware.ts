/**
 * Run lifecycle middleware — usage tracking, run finalization, and stream side-effects.
 *
 * Status transitions live in {@link createStatusMiddleware}; this middleware owns
 * everything else that hooks into the agent run lifecycle.
 */

import { extractTanStackUsage } from "../../managers/usage-tracker.js";

import type { RunFinalizeReason } from "../../managers/agent-types.js";
import type { UsageTracker } from "../../managers/usage-tracker.js";
import type { ModelPricing } from "../../models/types.js";
import type { ToolRunContext } from "../runner/run-context.js";
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
}

export function createLifecycleMiddleware(deps: LifecycleMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  let memoryCommitted = false;
  let thinkingEmitted = false;
  let runFinalized = false;

  const finalizeOnce = (reason: RunFinalizeReason, finishReason?: string | null): void => {
    if (runFinalized) return;
    runFinalized = true;
    deps.onRunFinalize?.(reason, finishReason);
  };

  return {
    name: "lifecycle",
    onStart: () => {
      memoryCommitted = false;
      thinkingEmitted = false;
      runFinalized = false;
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
