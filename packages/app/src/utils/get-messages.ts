import { useMessageCache } from "../hooks/use-message-cache";

import type { UIMessage } from "@tanstack/ai";

const { setMessage, getMessage } = useMessageCache.getActions();

const filterValidMessage = (message: UIMessage) => {
  if (message.role === "assistant") {
    if (message.parts.length === 1 && message.parts[0].type === "thinking") return false;
  }
  if (message.role === "user" || message.role === "assistant") {
    if (message.parts.length === 1 && message.parts[0].type === "text") {
      const content = message.parts[0].content?.trim() ?? "";
      if (content.length === 0) return false;
    }
  }
  return true;
};

/**
 * Split messages into static (completed) and dynamic (streaming) portions.
 */
export const getMessages = (messages: UIMessage[]) => {
  const staticMessages: UIMessage[] = [];
  const dynamicMessages: UIMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (i < messages.length - 1) {
      const flatMessage =
        getMessage(message.id) ||
        message.parts.reduce<UIMessage[]>((p, c, index) => {
          p.push({ ...message, id: message.id + "-" + index, parts: [c] });
          return p;
        }, []);

      setMessage(message.id, flatMessage);
      staticMessages.push(...flatMessage);
    } else {
      for (let idx = 0; idx < message.parts.length; idx++) {
        const part = message.parts[idx];
        if (part.type === "thinking" || part.type === "tool-result") continue;
        dynamicMessages.push({ ...message, id: message.id + "-" + idx, parts: [part] });
      }
    }
  }

  return {
    staticMessages: staticMessages.filter(filterValidMessage),
    dynamicMessages: dynamicMessages.filter(filterValidMessage),
  };
};
