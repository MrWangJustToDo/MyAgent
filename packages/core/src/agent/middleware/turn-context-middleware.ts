import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

export interface TurnContextMiddlewareDeps {
  getDynamicTurnContext: () => string | undefined;
}

/** Inject per-turn dynamic context (memory, todo nag) before the latest user message. */
export function injectTurnContext(messages: ModelMessage[], dynamicContext: string | undefined): ModelMessage[] {
  if (!dynamicContext) return messages;

  const contextMessages: ModelMessage[] = [
    { role: "user", content: `<turn_context>\n${dynamicContext}\n</turn_context>` },
    { role: "assistant", content: "Understood. I'll keep this context in mind." },
  ];

  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return i;
    }
    return -1;
  })();

  if (lastUserIdx >= 0) {
    return [...messages.slice(0, lastUserIdx), ...contextMessages, ...messages.slice(lastUserIdx)];
  }

  return [...messages, ...contextMessages];
}

export function createTurnContextMiddleware(deps: TurnContextMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  return {
    name: "turn-context",
    onConfig: async (_ctx, config) => {
      const messages = config.messages as ModelMessage[];
      return { messages: injectTurnContext(messages, deps.getDynamicTurnContext()) };
    },
  };
}
