import { useMessageCache } from "../hooks/use-message-cache";

import type { UIMessage } from "ai";

const { setMessage, getMessage } = useMessageCache.getActions();

/**
 * Split messages into static (completed) and dynamic (streaming) portions.
 *
 * Static messages are cached and rendered via Ink's <Static> component.
 * Dynamic messages are the currently streaming content that updates frequently.
 *
 * The split point is the latest user message. Everything from the latest user
 * input onward (user input + assistant response) is dynamic, everything before
 * is static. This ensures only the active turn re-renders, not the full history.
 */
export const getMessages = (messages: UIMessage[]) => {
  const staticMessages: UIMessage[] = [];
  const dynamicMessages: UIMessage[] = [];

  // Find the latest user message index — everything from there onward is dynamic
  let latestUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      latestUserIdx = i;
      break;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (i < latestUserIdx) {
      // Messages before the latest user input are fully static — use cache
      const flatMessage =
        getMessage(message.id) ||
        message.parts.reduce<UIMessage[]>((p, c, index) => {
          p.push({ ...message, id: message.id + "-" + index, parts: [c] });
          return p;
        }, []);

      setMessage(message.id, flatMessage);

      staticMessages.push(...flatMessage);
    } else {
      // Messages from the latest user input onward are dynamic
      message.parts.forEach((part, index) => {
        dynamicMessages.push({ ...message, id: message.id + "-" + index, parts: [part] });
      });
    }
  }

  return {
    staticMessages,
    dynamicMessages,
  };
};
