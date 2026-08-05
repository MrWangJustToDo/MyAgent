import { buildSystemPromptWithTurnContext } from "../managed-agent-prompt.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ChatMiddleware } from "@tanstack/ai";

export interface TurnContextMiddlewareDeps {
  /** Frozen system prompt (ends with SYSTEM_PROMPT_DYNAMIC_BOUNDARY when present). */
  getFrozenSystemPrompt: () => string | undefined;
}

/**
 * Keep `systemPrompts` frozen only. Dynamic turn context is admitted as synthetic
 * UI/user messages in {@link ManagedAgent.admitTurnContextIfNeeded}.
 */
export function createTurnContextMiddleware(deps: TurnContextMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "turn-context",
    onConfig: async (_ctx, _config) => {
      const systemPrompts = buildSystemPromptWithTurnContext(deps.getFrozenSystemPrompt());
      return systemPrompts ? { systemPrompts } : {};
    },
  };
}
