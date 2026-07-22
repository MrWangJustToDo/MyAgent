import type { ToolRunContext } from "../runner/run-context.js";
import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

export interface TurnContextMiddlewareDeps {
  getDynamicTurnContext: () => string | undefined | Promise<string | undefined>;
}

const TURN_CONTEXT_PREFIX = "<turn_context>";

function hasTurnContext(messages: ModelMessage[]): boolean {
  return messages.some(
    (m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith(TURN_CONTEXT_PREFIX)
  );
}

/** Inject per-turn dynamic context (memory, todo nag, date, git status) before the latest user message. */
export function injectTurnContext(messages: ModelMessage[], dynamicContext: string | undefined): ModelMessage[] {
  if (!dynamicContext) return messages;

  // Already injected for this chat() call — subsequent beforeModel phases
  // keep messages stable to preserve prefix cache.
  if (hasTurnContext(messages)) return messages;

  // Tool continuation in a new chat() call (pump loop). The LLM already
  // received context in the first call — skip to avoid message instability.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "tool") return messages;

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
      const context = await deps.getDynamicTurnContext();
      return { messages: injectTurnContext(messages, context) };
    },
  };
}
