import {
  computeToolCallsRenderSignature,
  dedupeToolCallsInMessages,
  getMessageToolSignature,
  normalizeToolPartsInMessages,
  shouldFlattenPart,
} from "./dedupe-tool-calls.js";
import { getFlatMessage, setFlatMessage } from "./message-flat-cache.js";
import {
  isActivitySummaryMessage,
  projectTranscriptForDisplay,
  type TranscriptDisplayMode,
} from "./project-transcript.js";

import type { TextPart, UIMessage } from "@tanstack/ai";

export type GetMessagesOptions = {
  mode?: TranscriptDisplayMode;
  isLoading?: boolean;
};

const filterValidMessage = (message: UIMessage) => {
  if (message.role === "assistant") {
    const onlyPart = message.parts.length === 1 ? message.parts[0] : null;
    // thinking-only rows are display-hidden; chat state keeps them until orphan-merge.
    if (onlyPart?.type === "thinking" || onlyPart?.type === "tool-result" || !onlyPart?.type) return false;
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
  // Keep user text + image parts together so UserMessageView can compose inline refs.
  if (message.role === "user") {
    return [message];
  }
  return message.parts.reduce<UIMessage[]>((parts, part, index) => {
    if (!shouldFlattenPart(part)) return parts;
    parts.push({ ...message, id: message.id + "-" + index, parts: [part] });
    return parts;
  }, []);
}

function resolveStaticFlatMessage(message: UIMessage): UIMessage[] {
  const signature = getMessageToolSignature(message);
  const cached = getFlatMessage(message.id);
  if (cached && cached.signature === signature) {
    return cached.flat;
  }

  const flatMessage = flattenMessage(message);
  setFlatMessage(message.id, { signature, flat: flatMessage });
  return flatMessage;
}

/**
 * Signature for ink Static rebuilds.
 * Only fingerprints the static portion (all but last display message) so live tool
 * updates on the dynamic last message do not remount the entire transcript.
 */
function computeStaticRenderSignature(
  displayMessages: UIMessage[],
  options: { mode: TranscriptDisplayMode; isLoading: boolean }
): string {
  const staticSource = displayMessages.length > 1 ? displayMessages.slice(0, -1) : ([] as UIMessage[]);

  const toolSig = computeToolCallsRenderSignature(staticSource);
  const summaries = staticSource
    .filter(isActivitySummaryMessage)
    .map((m) => {
      const text = m.parts[0]?.type === "text" ? ((m.parts[0] as TextPart).content ?? "") : "";
      return `${m.id}:${text}`;
    })
    .join(";");

  const ids = staticSource.map((m) => m.id).join(",");
  return `${options.mode}|L${options.isLoading ? 1 : 0}|n${staticSource.length}|${ids}|${summaries}|${toolSig}`;
}

/**
 * Split messages into static (completed) and dynamic (streaming) portions.
 * Tool-call parts with the same id are deduped (first wins) with state merged from later replays.
 * Compact mode collapses closed turns before flatten/split.
 */
export const getMessages = (messages: UIMessage[], options: GetMessagesOptions = {}) => {
  const mode = options.mode ?? "full";
  const isLoading = options.isLoading ?? false;

  const normalizedMessages = normalizeToolPartsInMessages(messages);
  const dedupedMessages = dedupeToolCallsInMessages(normalizedMessages);
  const displayMessages = projectTranscriptForDisplay(dedupedMessages, { mode, isLoading });

  const staticMessages: UIMessage[] = [];
  const dynamicMessages: UIMessage[] = [];

  for (let i = 0; i < displayMessages.length; i++) {
    const message = displayMessages[i];
    if (i < displayMessages.length - 1) {
      staticMessages.push(...resolveStaticFlatMessage(message));
    } else if (message.role === "user") {
      dynamicMessages.push(message);
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
    toolCallsSignature: computeStaticRenderSignature(displayMessages, { mode, isLoading }),
  };
};
