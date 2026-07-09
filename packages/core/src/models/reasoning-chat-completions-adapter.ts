import { OpenAIBaseChatCompletionsTextAdapter } from "@tanstack/openai-base";
import OpenAI from "openai";

import { buildReasoningContentFromThinking, extractReasoningContentFromStreamChunk } from "./reasoning-echo.js";

import type { ModelMessage } from "@tanstack/ai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";

export interface ReasoningChatCompletionsConfig {
  apiKey: string;
  baseURL?: string;
}

/**
 * Chat Completions adapter that round-trips DeepSeek thinking mode `reasoning_content`.
 *
 * TanStack's base adapter surfaces stream reasoning via `extractReasoning` but does not
 * write `reasoning_content` back in `convertMessage`, which DeepSeek requires on later turns.
 */
export class ReasoningChatCompletionsTextAdapter extends OpenAIBaseChatCompletionsTextAdapter<
  string,
  Record<string, unknown>
> {
  constructor(config: ReasoningChatCompletionsConfig, model: string) {
    super(model, "reasoning-chat", new OpenAI(config));
  }

  protected override extractReasoning(chunk: unknown): { text: string } | undefined {
    const reasoning = extractReasoningContentFromStreamChunk(chunk);
    return reasoning ? { text: reasoning } : undefined;
  }

  protected override convertMessage(message: ModelMessage): ChatCompletionMessageParam {
    const converted = super.convertMessage(message);

    if (message.role !== "assistant") {
      return converted;
    }

    const reasoningContent = buildReasoningContentFromThinking(message.thinking);
    if (!reasoningContent) {
      return converted;
    }

    return {
      ...converted,
      reasoning_content: reasoningContent,
    } as unknown as ChatCompletionMessageParam;
  }
}

export function createReasoningChatCompletions(
  model: string,
  apiKey: string,
  config?: Omit<ReasoningChatCompletionsConfig, "apiKey">
): ReasoningChatCompletionsTextAdapter {
  return new ReasoningChatCompletionsTextAdapter({ apiKey, ...config }, model);
}
