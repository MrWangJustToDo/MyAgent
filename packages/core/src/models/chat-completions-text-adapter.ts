import { OpenAIBaseChatCompletionsTextAdapter } from "@tanstack/openai-base";
import OpenAI from "openai";

import { liftToolMediaForChatCompletions } from "./lift-tool-media-for-chat-completions.js";

import type { TextOptions } from "@tanstack/ai";

export interface ChatCompletionsTextAdapterConfig {
  apiKey: string;
  baseURL?: string;
  maxRetries?: number;
  dangerouslyAllowBrowser?: boolean;
}

/**
 * OpenAI-compatible Chat Completions adapter with tool-result image lifting.
 *
 * Base TanStack behavior JSON.stringifies multimodal tool content; this subclass
 * rewrites messages first so images become user `image_url` parts.
 */
export class ChatCompletionsTextAdapter extends OpenAIBaseChatCompletionsTextAdapter<string, Record<string, unknown>> {
  constructor(config: ChatCompletionsTextAdapterConfig, model: string) {
    super(
      model,
      "chat-completions",
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        maxRetries: config.maxRetries,
        dangerouslyAllowBrowser: config.dangerouslyAllowBrowser ?? true,
      })
    );
  }

  protected override mapOptionsToRequest(options: TextOptions) {
    return super.mapOptionsToRequest({
      ...options,
      messages: liftToolMediaForChatCompletions(options.messages),
    });
  }
}

export function createChatCompletions(
  model: string,
  apiKey: string,
  config?: Omit<ChatCompletionsTextAdapterConfig, "apiKey">
): ChatCompletionsTextAdapter {
  return new ChatCompletionsTextAdapter({ apiKey, ...config }, model);
}
