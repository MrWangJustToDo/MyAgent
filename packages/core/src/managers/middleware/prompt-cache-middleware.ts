import {
  applyAnthropicLatestUserCacheBreakpoint,
  applyAnthropicToolCacheBreakpoint,
  buildAnthropicCachedSystemPrompts,
  shouldApplyAnthropicCacheBreakpoints,
  shouldApplyOpenAIPromptCacheKey,
  sortToolsByName,
} from "../../models/cache/prompt-cache.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelStyle } from "../../models/types.js";
import type { ChatMiddleware, ModelMessage, ServerTool, SystemPrompt } from "@tanstack/ai";

export interface PromptCacheMiddlewareDeps {
  getModelStyle: () => ModelStyle | undefined;
  /** Stable session-scoped key for OpenAI `prompt_cache_key`. */
  getPromptCacheKey: () => string;
}

/**
 * Stable fingerprint for a tool set so the sorted array can be memoized:
 * the sort only depends on names, but the *array content* (schemas) must be
 * part of the key too — otherwise a same-name/different-schema swap would
 * return stale tool objects. Falls back to `name` alone when a schema is not
 * JSON-serializable.
 */
function toolSetFingerprint(tools: ServerTool[]): string {
  return tools
    .map((t) => {
      let schema = "";
      try {
        schema = JSON.stringify(t.inputSchema ?? null);
      } catch {
        schema = "(non-serializable)";
      }
      return `${t.name}:${schema}`;
    })
    .join("\u0001");
}

/**
 * Provider prompt-cache wiring (P0):
 * - Anthropic: `cache_control` on frozen system, last tool, latest user
 * - OpenAI-compatible: `prompt_cache_key` (session affinity)
 * - All styles: stable tool name order
 */
export function createPromptCacheMiddleware(deps: PromptCacheMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  // Memoized sorted tool list: reuse the same array reference whenever the tool
  // set is unchanged, avoiding a re-sort + fresh allocation on every request.
  let cachedToolFingerprint = "";
  let cachedSortedTools: ServerTool[] | null = null;

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
        const fingerprint = toolSetFingerprint(tools);
        if (cachedToolFingerprint !== fingerprint) {
          cachedSortedTools = sortToolsByName(tools);
          cachedToolFingerprint = fingerprint;
        }
        patch.tools = cachedSortedTools ?? sortToolsByName(tools);
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
