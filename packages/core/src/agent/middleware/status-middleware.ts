/**
 * Agent status middleware — status transitions only.
 *
 * Usage tracking, memory commit, run finalization, and stream events live in
 * {@link createLifecycleMiddleware}. Compaction calls {@link AgentStatusController}
 * directly via {@link createCompactionMiddleware}.
 */

import type { AgentStatusController } from "../../managers/agent-status-controller.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Status middleware
// ============================================================================

export interface StatusMiddlewareDeps {
  status: AgentStatusController;
}

export function createStatusMiddleware(deps: StatusMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "status",
    onStart: () => {
      deps.status.onRunStart();
    },
    onChunk: (_ctx, chunk) => deps.status.onStreamChunk(chunk),
    onFinish: (_ctx, info) => {
      deps.status.onRunFinish(info.finishReason);
    },
    onAbort: () => {
      deps.status.onRunAbort();
    },
    onError: (_ctx, info) => {
      const message = info.error instanceof Error ? info.error.message : String(info.error);
      deps.status.onRunError(message);
    },
    onToolPhaseComplete: async (_ctx, info) => {
      deps.status.syncApprovals(info.needsApproval);
    },
    onBeforeToolCall: async () => {
      deps.status.onBeforeToolCall();
      return;
    },
  };
}
