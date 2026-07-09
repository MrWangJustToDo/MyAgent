import { useMessageCache } from "../hooks/use-message-cache.js";

import {
  computeToolCallsRenderSignature,
  dedupeToolCallsInMessages,
  getMessageToolSignature,
  normalizeToolPartsInMessages,
  shouldFlattenPart,
} from "./dedupe-tool-calls.js";

import type { UIMessage } from "@tanstack/ai";

const { setMessage, getMessage } = useMessageCache.getActions();

const filterValidMessage = (message: UIMessage) => {
  if (message.role === "assistant") {
    const onlyPart = message.parts.length === 1 ? message.parts[0] : null;
    if (onlyPart?.type === "thinking" || onlyPart?.type === "tool-result") return false;
  }
  if (message.role === "user" || message.role === "assistant") {
    if (message.parts.length === 1 && message.parts[0].type === "text") {
      const content = message.parts[0].content?.trim() ?? "";
      if (content.length === 0) return false;
    }
  }
  return true;
};

function flattenMessage(message: UIMessage): UIMessage[] {
  return message.parts.reduce<UIMessage[]>((parts, part, index) => {
    if (!shouldFlattenPart(part)) return parts;
    parts.push({ ...message, id: message.id + "-" + index, parts: [part] });
    return parts;
  }, []);
}

function resolveStaticFlatMessage(message: UIMessage): UIMessage[] {
  const signature = getMessageToolSignature(message);
  const cached = getMessage(message.id);
  if (cached && cached.signature === signature) {
    return cached.flat;
  }

  const flatMessage = flattenMessage(message);
  setMessage(message.id, { signature, flat: flatMessage });
  return flatMessage;
}

/**
 * Split messages into static (completed) and dynamic (streaming) portions.
 * Tool-call parts with the same id are deduped (first wins) with state merged from later replays.
 */
export const getMessages = (messages: UIMessage[]) => {
  const normalizedMessages = normalizeToolPartsInMessages(messages);
  const dedupedMessages = dedupeToolCallsInMessages(normalizedMessages);
  const staticMessages: UIMessage[] = [];
  const dynamicMessages: UIMessage[] = [];

  for (let i = 0; i < dedupedMessages.length; i++) {
    const message = dedupedMessages[i];
    if (i < dedupedMessages.length - 1) {
      staticMessages.push(...resolveStaticFlatMessage(message));
    } else {
      for (let idx = 0; idx < message.parts.length; idx++) {
        const part = message.parts[idx];
        if (!shouldFlattenPart(part)) continue;
        dynamicMessages.push({ ...message, id: message.id + "-" + idx, parts: [part] });
      }
    }
  }

  return {
    staticMessages: staticMessages.filter(filterValidMessage),
    dynamicMessages: dynamicMessages.filter(filterValidMessage),
    toolCallsSignature: computeToolCallsRenderSignature(dedupedMessages),
  };
};
