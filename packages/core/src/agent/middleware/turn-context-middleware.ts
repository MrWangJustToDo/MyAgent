import { buildSystemPromptWithTurnContext } from "../../managers/managed-agent-prompt.js";

import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware } from "@tanstack/ai";

export interface TurnContextMiddlewareDeps {
  /** Frozen system prompt (ends with SYSTEM_PROMPT_DYNAMIC_BOUNDARY when present). */
  getFrozenSystemPrompt: () => string | undefined;
  /** Per-user-turn snapshot — stable across tool iterations within the turn. */
  getTurnContextSnapshot: () => string | undefined;
}

/** Apply turn-scoped dynamic context via system prompt (not conversation messages). */
export function createTurnContextMiddleware(deps: TurnContextMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "turn-context",
    onConfig: async (_ctx, _config) => {
      const systemPrompts = buildSystemPromptWithTurnContext(
        deps.getFrozenSystemPrompt(),
        deps.getTurnContextSnapshot()
      );
      return systemPrompts ? { systemPrompts } : {};
    },
  };
}
