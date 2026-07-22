import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { ExtensionRunner } from "../extension/runner.js";
import type { ToolBeforeEvent } from "../extension/types.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { TodoManager } from "../todo-manager";
import type { ChatMiddleware } from "@tanstack/ai";

export interface ExtensionsMiddlewareDeps {
  getExtensionRunner: () => ExtensionRunner | null;
  getSessionId: () => string;
  getTodoManager?: () => TodoManager | null;
  emitEvent?: (type: AgentEventType, data?: Record<string, unknown>) => void;
}

export function createExtensionsMiddleware(deps: ExtensionsMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "extensions",
    onBeforeToolCall: async (_ctx, hookCtx) => {
      deps.emitEvent?.("agent:tool-start", {
        tool_name: hookCtx.toolName,
        tool_input: hookCtx.args,
      });

      const runner = deps.getExtensionRunner();
      if (!runner) return;

      const eventBus = runner.getEventBus();
      const event: ToolBeforeEvent = {
        type: `tool:before:${hookCtx.toolName}`,
        payload: {
          toolName: hookCtx.toolName,
          args: hookCtx.args,
          sessionId: deps.getSessionId(),
        },
        defaultReturn: undefined,
      };

      await eventBus.emit(event);

      if (event.skip) {
        return {
          type: "skip",
          result: { error: event.reason ?? "Tool denied by extension" },
        };
      }

      if (event.modifiedArgs !== undefined) {
        return {
          type: "transformArgs",
          args: event.modifiedArgs,
        };
      }

      return;
    },
    onAfterToolCall: async (_ctx, info) => {
      if (info.ok && info.toolName === "todo") {
        deps.getTodoManager?.()?.resetRoundCounter();
      }

      const runner = deps.getExtensionRunner();
      if (!runner) return;

      const eventBus = runner.getEventBus();

      if (info.ok) {
        deps.emitEvent?.("agent:tool-end", {
          tool_name: info.toolName,
          duration_ms: info.duration,
          tool_output: info.result,
        });

        await eventBus.emit({
          type: `tool:after:${info.toolName}`,
          payload: {
            toolName: info.toolName,
            args: info.toolCall.function.arguments,
            result: info.result,
            durationMs: info.duration,
          },
          defaultReturn: undefined,
        });
      } else {
        deps.emitEvent?.("agent:tool-error", {
          tool_name: info.toolName,
          error: info.error instanceof Error ? info.error.message : String(info.error),
        });

        await eventBus.emit({
          type: `tool:error:${info.toolName}`,
          payload: {
            toolName: info.toolName,
            args: info.toolCall.function.arguments,
            error: info.error instanceof Error ? info.error.message : String(info.error),
          },
          defaultReturn: undefined,
        });
      }
    },
  };
}
