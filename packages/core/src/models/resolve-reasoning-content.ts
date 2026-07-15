import { buildReasoningContentFromThinking } from "./reasoning-echo.js";

import type { ReasoningContentCache } from "./reasoning-content-cache.js";
import type { ModelMessage } from "@tanstack/ai";

/** Resolve DeepSeek `reasoning_content` for an assistant model message. */
export function resolveReasoningContentForAssistant(
  message: ModelMessage,
  cache: ReasoningContentCache
): string | undefined {
  if (message.role !== "assistant") return undefined;

  const fromThinking = buildReasoningContentFromThinking(message.thinking);
  const toolCallIds = message.toolCalls?.map((tc) => tc.id);
  const fromCache = cache.lookup(toolCallIds, !toolCallIds?.length);
  const reasoning = fromThinking ?? fromCache;

  if (fromThinking && toolCallIds?.length) {
    cache.remember(fromThinking, toolCallIds);
  }

  return reasoning;
}
