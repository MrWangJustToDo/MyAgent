import { runHooks } from "../hooks/hook-runner.js";

import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { AgentLog } from "../agent-log";
import type { HookRegistry } from "../hooks/hook-registry.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { TodoManager } from "../todo-manager";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Hooks middleware
// ============================================================================

export interface HooksMiddlewareDeps {
  getHookRegistry: () => HookRegistry | null;
  getSessionId: () => string;
  getTodoManager?: () => TodoManager | null;
  log: AgentLog | null;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
}

/**
 * Bridges {@link HookRegistry} scripts to TanStack tool hooks.
 */
export function createHooksMiddleware(deps: HooksMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "hooks",
    onBeforeToolCall: async (_ctx, hookCtx) => {
      deps.emitEvent?.("agent:tool-start", {
        tool_name: hookCtx.toolName,
        tool_input: hookCtx.args,
      });

      const registry = deps.getHookRegistry();
      if (!registry?.hasHooks()) return;

      const result = await runHooks(
        registry,
        "PreToolUse",
        {
          hook_event_name: "PreToolUse",
          session_id: deps.getSessionId(),
          tool_name: hookCtx.toolName,
          tool_input: hookCtx.args,
        },
        { matchValue: hookCtx.toolName, logger: deps.log ?? undefined }
      );

      if (result.decision === "deny") {
        return {
          type: "skip",
          result: { error: result.reason ?? "Tool denied by hook" },
        };
      }

      if (result.modifiedInput !== undefined) {
        return { type: "transformArgs", args: result.modifiedInput };
      }

      return;
    },
    onAfterToolCall: async (_ctx, info) => {
      if (info.ok && info.toolName === "todo") {
        deps.getTodoManager?.()?.resetRoundCounter();
      }

      const registry = deps.getHookRegistry();
      if (!registry?.hasHooks()) return;

      if (info.ok) {
        deps.emitEvent?.("agent:tool-end", {
          tool_name: info.toolName,
          duration_ms: info.duration,
          tool_output: info.result,
        });

        await runHooks(
          registry,
          "PostToolUse",
          {
            hook_event_name: "PostToolUse",
            session_id: deps.getSessionId(),
            tool_name: info.toolName,
            tool_input: info.toolCall.function.arguments,
            tool_output: info.result,
            duration_ms: info.duration,
          },
          { matchValue: info.toolName, logger: deps.log ?? undefined }
        );
      } else {
        deps.emitEvent?.("agent:tool-error", {
          tool_name: info.toolName,
          error: info.error instanceof Error ? info.error.message : String(info.error),
        });

        await runHooks(
          registry,
          "PostToolUseFailure",
          {
            hook_event_name: "PostToolUseFailure",
            session_id: deps.getSessionId(),
            tool_name: info.toolName,
            tool_input: info.toolCall.function.arguments,
            error: info.error instanceof Error ? info.error.message : String(info.error),
          },
          { matchValue: info.toolName, logger: deps.log ?? undefined }
        );
      }
    },
  };
}
