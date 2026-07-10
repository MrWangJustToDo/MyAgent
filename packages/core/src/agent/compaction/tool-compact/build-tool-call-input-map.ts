import type { ModelMessage } from "@tanstack/ai";

/** Build toolCallId → parsed tool input from assistant `toolCalls`. */
export function buildToolCallInputMap(messages: ModelMessage[]): Map<string, unknown> {
  const map = new Map<string, unknown>();

  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls) continue;

    for (const toolCall of message.toolCalls) {
      const raw = toolCall.function.arguments;
      if (typeof raw !== "string") {
        map.set(toolCall.id, raw);
        continue;
      }

      try {
        map.set(toolCall.id, JSON.parse(raw));
      } catch {
        map.set(toolCall.id, raw);
      }
    }
  }

  return map;
}
