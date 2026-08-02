/**
 * Apply each server tool result to the UI as soon as that tool finishes.
 *
 * TanStack `chat()` runs tools sequentially but only emits batched
 * TOOL_CALL_END/RESULT chunks after the entire tool phase completes. Without
 * this middleware, earlier tools stay spinner/`input-complete` until siblings
 * finish — especially visible for long-running `task` tools.
 */

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { AgentUIChannel } from "../../runtime-types";
import type { ChatMiddleware } from "@tanstack/ai";

export interface EarlyToolResultUiMiddlewareDeps {
  getUIChannel: () => AgentUIChannel | null | undefined;
}

export function createEarlyToolResultUiMiddleware(
  deps: EarlyToolResultUiMiddlewareDeps
): ChatMiddleware<ToolRunContext> {
  return {
    name: "early-tool-result-ui",
    onAfterToolCall: async (_ctx, info) => {
      const toolCallId = info.toolCallId;
      if (!toolCallId) return;

      const channel = deps.getUIChannel();
      if (!channel) return;

      if (info.ok) {
        channel.addToolResult(toolCallId, info.result ?? null);
        return;
      }

      const message = info.error instanceof Error ? info.error.message : String(info.error ?? "Tool execution failed");
      channel.addToolResult(toolCallId, { error: message }, message);
    },
  };
}
