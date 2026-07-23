import { getPlanModeToolBlockReason } from "./plan-tools.js";

import type { PlanModeController } from "./plan-mode-controller.js";
import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware } from "@tanstack/ai";

export interface PlanModeMiddlewareDeps {
  getPlanMode: () => PlanModeController | null;
}

/** Skip forbidden / unsafe tools while plan mode restricts tooling. */
export function createPlanModeMiddleware(deps: PlanModeMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "plan-mode",
    onBeforeToolCall: async (_ctx, hookCtx) => {
      const planMode = deps.getPlanMode();
      const reason = getPlanModeToolBlockReason(planMode, hookCtx.toolName, hookCtx.args);
      if (!reason) return;
      return {
        type: "skip",
        result: { error: reason },
      };
    },
  };
}
