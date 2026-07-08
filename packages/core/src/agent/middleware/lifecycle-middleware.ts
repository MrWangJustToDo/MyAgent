import { resolveFinishStatus } from "../../managers/agent-status.js";
import { extractTanStackUsage } from "../../managers/usage-tracker.js";

import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { AgentStatus, RunFinalizeReason } from "../../managers/agent-types.js";
import type { UsageTracker } from "../../managers/usage-tracker.js";
import type { ModelPricing } from "../../models/types.js";
import type { AgentLog } from "../agent-log";
import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware, StreamChunk } from "@tanstack/ai";

// ============================================================================
// Lifecycle / status middleware
// ============================================================================

export interface LifecycleMiddlewareDeps {
  getStatus: () => AgentStatus;
  setStatus: (status: AgentStatus) => void;
  getError: () => string;
  setError: (error: string) => void;
  usage: UsageTracker;
  log: AgentLog | null;
  getPricing: () => ModelPricing | null | undefined;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
  onPromptSubmit?: () => void;
  onFirstModelOutput?: () => void;
  onRunFinalize?: (reason: RunFinalizeReason, finishReason?: string | null) => void;
}

function applyChunkStatus(
  getStatus: () => AgentStatus,
  setStatus: (status: AgentStatus) => void,
  chunk: StreamChunk
): void {
  const type = chunk.type;

  if (type === "TOOL_CALL_START") {
    setStatus("running");
    return;
  }

  if (type === "REASONING_MESSAGE_CONTENT" || type === "REASONING_MESSAGE_START") {
    setStatus("thinking");
    return;
  }

  if (type === "TEXT_MESSAGE_CONTENT") {
    const status = getStatus();
    if (status === "running" || status === "thinking") {
      setStatus("responding");
    }
  }
}

/**
 * Updates agent lifecycle from AG-UI stream events and lifecycle hooks.
 */
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
      deps.setStatus("running");
      deps.setError("");
      deps.onPromptSubmit?.();
    },
    onChunk: (_ctx, chunk) => {
      if (
        !thinkingEmitted &&
        (chunk.type === "REASONING_MESSAGE_START" || chunk.type === "REASONING_MESSAGE_CONTENT")
      ) {
        thinkingEmitted = true;
        deps.emitEvent?.("agent:thinking");
      }

      if (!memoryCommitted && chunk.type === "TEXT_MESSAGE_CONTENT") {
        memoryCommitted = true;
        deps.onFirstModelOutput?.();
      }
      applyChunkStatus(deps.getStatus, deps.setStatus, chunk);
      return chunk;
    },
    onUsage: (_ctx, usage) => {
      deps.usage.updateWindowUsage(extractTanStackUsage(usage), deps.getPricing());
    },
    onFinish: (_ctx, info) => {
      deps.setStatus(resolveFinishStatus(deps.getStatus(), deps.getError()));
      finalizeOnce("finished", info.finishReason);
    },
    onAbort: () => {
      deps.setStatus("aborted");
      finalizeOnce("aborted");
    },
    onError: (_ctx, info) => {
      const message = info.error instanceof Error ? info.error.message : String(info.error);
      deps.setError(message);
      deps.setStatus("error");
      deps.emitEvent?.("agent:stream-error", { error: message });
      finalizeOnce("error");
    },
  };
}
