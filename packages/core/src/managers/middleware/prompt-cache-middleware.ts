import {
  applyAnthropicLatestUserCacheBreakpoint,
  applyAnthropicToolCacheBreakpoint,
  buildAnthropicCachedSystemPrompts,
  shouldApplyAnthropicCacheBreakpoints,
  shouldApplyOpenAIPromptCacheKey,
  sortToolsByName,
} from "../../models/prompt-cache.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelStyle } from "../../models/types.js";
import type { ChatMiddleware, ModelMessage, ServerTool, SystemPrompt } from "@tanstack/ai";

export interface PromptCacheMiddlewareDeps {
  getModelStyle: () => ModelStyle | undefined;
  /** Stable session-scoped key for OpenAI `prompt_cache_key`. */
  getPromptCacheKey: () => string;
}

/**
 * Provider prompt-cache wiring (P0):
 * - Anthropic: `cache_control` on frozen system, last tool, latest user
 * - OpenAI-compatible: `prompt_cache_key` (session affinity)
 * - All styles: stable tool name order
 */
export function createPromptCacheMiddleware(deps: PromptCacheMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "prompt-cache",
    onConfig: async (_ctx, config) => {
      const style = deps.getModelStyle();
      const patch: {
        systemPrompts?: SystemPrompt[];
        tools?: ServerTool[];
        messages?: ModelMessage[];
        modelOptions?: Record<string, unknown>;
      } = {};

      const tools = config.tools as ServerTool[] | undefined;
      if (shouldApplyAnthropicCacheBreakpoints(style)) {
        patch.systemPrompts = buildAnthropicCachedSystemPrompts(config.systemPrompts as SystemPrompt[] | undefined);
        patch.tools = applyAnthropicToolCacheBreakpoint(tools);
        patch.messages = applyAnthropicLatestUserCacheBreakpoint(config.messages as ModelMessage[]);
      } else if (tools?.length) {
        patch.tools = sortToolsByName(tools);
      }

      if (shouldApplyOpenAIPromptCacheKey(style)) {
        const existing =
          config.modelOptions && typeof config.modelOptions === "object"
            ? (config.modelOptions as Record<string, unknown>)
            : {};
        patch.modelOptions = {
          ...existing,
          prompt_cache_key: deps.getPromptCacheKey(),
        };
      }

      return patch;
    },
  };
}
