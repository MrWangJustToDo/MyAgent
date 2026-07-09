import type { ManagedAgent } from "./managed-agent.js";
import type { ModelMessage, UIMessage } from "@tanstack/ai";

/**
 * TanStack `chat()` reads approval state from {@link UIMessage} tool-call `parts`
 * before converting to {@link ModelMessage}.
 */
export function hasUIMessageParts(messages: Array<UIMessage | ModelMessage>): boolean {
  return messages.some((message) => "parts" in message && Array.isArray(message.parts));
}

/** Prefer client UIMessages for chat(); fall back to compacted model context. */
export function selectInitialRunMessages(
  inputMessages: Array<UIMessage | ModelMessage> | undefined,
  prepared: ModelMessage[],
  managed: ManagedAgent
): Array<UIMessage | ModelMessage> {
  if (inputMessages?.length && hasUIMessageParts(inputMessages)) {
    return inputMessages;
  }
  const contextUi = managed.getContext()?.getUIMessages();
  if (contextUi?.length && hasUIMessageParts(contextUi)) {
    return contextUi;
  }
  return prepared;
}
