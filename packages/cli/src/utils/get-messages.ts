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
      // Last message - split into static (completed steps) and dynamic (current step)
      if (message.role === "user") {
        for (let idx = 0; idx < message.parts.length; idx++) {
          dynamicMessages.push({ ...message, id: message.id + "-" + idx, parts: [message.parts[idx]] });
        }
      } else {
        // For assistant messages, find the last step-start boundary.
        // Parts before it are static, parts from it onward are dynamic.
        let lastStepStartIdx = -1;
        for (let j = message.parts.length - 1; j >= 0; j--) {
          if (message.parts[j].type === "step-start") {
            lastStepStartIdx = j;
            break;
          }
        }

        // Everything before lastStepStartIdx is static
        for (let j = 0; j < lastStepStartIdx; j++) {
          const part = message.parts[j];
          if (part.type === "step-start") continue;
          staticMessages.push({ ...message, id: message.id + "-static-" + j, parts: [part] });
        }

        // Everything from lastStepStartIdx onward is dynamic (skip the step-start itself)
        const dynamicStart = lastStepStartIdx >= 0 ? lastStepStartIdx + 1 : 0;
        for (let j = dynamicStart; j < message.parts.length; j++) {
          const part = message.parts[j];
          if (part.type === "step-start") continue;
          dynamicMessages.push({ ...message, id: message.id + "-dynamic-" + j, parts: [part] });
        }
      }
    }
  }

  return {
    staticMessages,
    dynamicMessages,
  };
};
