import { useMessageCache } from "../hooks/use-message-cache";

import type { UIMessage } from "ai";

const { setMessage, getMessage } = useMessageCache.getActions();

/**
 * Split messages into static (completed) and dynamic (streaming) portions.
 *
 * Static messages are cached and rendered via Ink's <Static> component.
 * Dynamic messages are the currently streaming content that updates frequently.
 *
 * The split happens at "step-start" boundaries to allow completed steps
 * to become static while the current step remains dynamic.
 */
export const getMessages = (messages: UIMessage[]) => {
  const staticMessages: UIMessage[] = [];
  const dynamicMessages: UIMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (i < messages.length - 1) {
      // Previous messages are fully static - use cache if available
      const flatMessage =
        getMessage(message.id) ||
        message.parts.reduce<UIMessage[]>((p, c, index) => {
          p.push({ ...message, id: message.id + "-" + index, parts: [c] });
          return p;
        }, []);

      setMessage(message.id, flatMessage);

      staticMessages.push(...flatMessage);
    } else {
      // message.parts.forEach((part, index) => {
      //   dynamicMessages.push({ ...message, id: message.id + "-" + index, parts: [part] });
      // });
      // Last message - split into static (completed steps) and dynamic (current step)
      if (message.role === "user") {
        message.parts.forEach((part, index) => {
          dynamicMessages.push({ ...message, id: message.id + "-" + index, parts: [part] });
        });
      } else {
        // For assistant messages, split at step-start boundaries
        // Parts before the last step-start are static, parts after are dynamic
        let staticParts: UIMessage["parts"] = [];
        let dynamicParts: UIMessage["parts"] = [];

        for (const part of message.parts) {
          if (part.type === "step-start") {
            // Move current dynamic parts to static when we hit a new step
            staticParts = [...staticParts, ...dynamicParts];
            dynamicParts = [];
          } else {
            dynamicParts = [...dynamicParts, part];
          }
        }

        // Add static parts as individual messages
        staticParts.forEach((p, index) => {
          staticMessages.push({ ...message, id: message.id + "-static-" + index, parts: [p] });
        });

        // Add dynamic parts as individual messages
        dynamicParts.forEach((p, index) => {
          dynamicMessages.push({ ...message, id: message.id + "-dynamic-" + index, parts: [p] });
        });
      }
    }
  }

  return {
    staticMessages,
    dynamicMessages,
  };
};
