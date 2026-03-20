import { useMessageCache } from "../hooks/use-message-cache";

import type { UIMessage } from "ai";

const { setMessage, getMessage } = useMessageCache.getActions();

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
      if (message.role === "user") {
        message.parts.forEach((i, index) => {
          dynamicMessages.push({ ...message, id: message.id + "-" + index, parts: [i] });
        });
      } else {
        const staticPart: UIMessage["parts"] = [];
        const dynamicPart: UIMessage["parts"] = [];
        message.parts.forEach((i) => {
          if (i.type === "step-start") {
            staticPart.push(...dynamicPart);
            dynamicPart.length = 0;
          } else {
            dynamicPart.push(i);
          }
        });
        staticPart.forEach((p, index) => staticMessages.push({ ...message, id: message.id + "-" + index, parts: [p] }));
        dynamicPart.forEach((p, index) =>
          dynamicMessages.push({ ...message, id: message.id + "-" + index, parts: [p] })
        );
      }
    }
  }

  return {
    staticMessages,
    dynamicMessages,
  };
};
