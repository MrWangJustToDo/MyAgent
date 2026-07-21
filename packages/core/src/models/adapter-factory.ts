import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";

import { createReasoningChatCompletions } from "./reasoning-chat-completions-adapter.js";
import { shouldEchoReasoningContent } from "./reasoning-echo.js";

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
 *
 * OpenAI-compatible providers (DeepSeek, Ollama, OpenRouter, gateways) use the
 * Chat Completions API (`/chat/completions`), not OpenAI's newer Responses API.
 */
export function createTextAdapter(config: ModelAdapterConfig): TextAdapterConfig {
  const { style, model, baseURL, apiKey } = config;

  const trimmedBaseURL = baseURL?.trim();
  if (!trimmedBaseURL) {
    throw new Error(
      `Model baseURL is required for style "${style}". Set BASE_URL (or MODEL_BASE_URL) in .env or pass modelBaseURL when creating the agent.`
    );
  }

  if (style === "anthropic") {
    if (!apiKey) {
      throw new Error("Anthropic style requires an API key (API_KEY or ANTHROPIC_API_KEY)");
    }
    return {
      adapter: createAnthropicChat(model as Parameters<typeof createAnthropicChat>[0], apiKey, {
        baseURL: trimmedBaseURL,
      }),
      model,
    };
  }

  const key = apiKey || "not-needed";
  const openaiConfig = { baseURL: trimmedBaseURL, maxRetries: 0 };

  if (shouldEchoReasoningContent(trimmedBaseURL, model)) {
    return {
      adapter: createReasoningChatCompletions(model, key, openaiConfig) as AnyTextAdapter,
      model,
    };
  }

  return {
    adapter: createOpenaiChatCompletions(model as Parameters<typeof createOpenaiChatCompletions>[0], key, {
      ...openaiConfig,
      dangerouslyAllowBrowser: true,
    }),
    model,
  };
}
