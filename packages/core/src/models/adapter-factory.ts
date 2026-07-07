import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createOpenaiChat } from "@tanstack/ai-openai";

import type { ModelStyle } from "./types.js";
import type { AnyTextAdapter } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface TextAdapterConfig {
  adapter: AnyTextAdapter;
  /** Model id passed to `chat({ model })` */
  model: string;
}

export interface ModelAdapterConfig {
  style: ModelStyle;
  model: string;
  baseURL: string;
  apiKey?: string;
}

// ============================================================================
// Adapter Factory
// ============================================================================

/**
 * Create a TanStack text adapter for OpenAI-compatible or Anthropic APIs.
 */
export function createTextAdapter(config: ModelAdapterConfig): TextAdapterConfig {
  const { style, model, baseURL, apiKey } = config;

  if (style === "anthropic") {
    if (!apiKey) {
      throw new Error("Anthropic style requires an API key (API_KEY or ANTHROPIC_API_KEY)");
    }
    return {
      adapter: createAnthropicChat(model as Parameters<typeof createAnthropicChat>[0], apiKey, {
        baseURL,
      }),
      model,
    };
  }

  const key = apiKey || "not-needed";
  return {
    adapter: createOpenaiChat(model as Parameters<typeof createOpenaiChat>[0], key, { baseURL }),
    model,
  };
}
