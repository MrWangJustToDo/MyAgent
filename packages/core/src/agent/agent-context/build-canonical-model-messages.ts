import { convertMessagesToModelMessages, type ModelMessage, type UIMessage } from "@tanstack/ai";

const SUMMARY_START = "[CONVERSATION SUMMARY]";

function extractTextContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part.type === "text" && "content" in part) return String(part.content);
      return "";
    })
    .join("");
}

function isCompactionSummaryMessage(message: ModelMessage, summaryMessage?: ModelMessage | null): boolean {
  if (summaryMessage && message === summaryMessage) return true;
  if (message.role !== "user") return false;
  return extractTextContent(message.content).startsWith(SUMMARY_START);
}

export interface BuildCanonicalModelMessagesOptions {
  runBaselineCount?: number;
  summaryMessage?: ModelMessage | null;
  compactIndex?: number;
}

/**
 * Rebuild the full model-message history for compaction.
 *
 * TanStack may overwrite its internal `messages` with a compacted LLM view during a run.
 * UI messages are the durable source of truth; when the engine has grown past the run
 * baseline we append `engine.slice(runBaselineCount)`. When the engine has been replaced
 * with a compacted LLM view (`[summary, ...tail]`), rebuild as
 * `fromUI.slice(0, compactIndex) + tail`.
 */
export function buildCanonicalModelMessages(
  uiMessages: UIMessage[],
  engineMessages: ModelMessage[],
  runBaselineCountOrOptions: number | BuildCanonicalModelMessagesOptions = 0
): ModelMessage[] {
  const options =
    typeof runBaselineCountOrOptions === "number"
      ? { runBaselineCount: runBaselineCountOrOptions }
      : runBaselineCountOrOptions;
  const runBaselineCount = options.runBaselineCount ?? 0;
  const summaryMessage = options.summaryMessage ?? null;
  const compactIndex = options.compactIndex ?? 0;

  if (uiMessages.length === 0) {
    return engineMessages;
  }

  const fromUI = convertMessagesToModelMessages(uiMessages);

  if (runBaselineCount > 0 && engineMessages.length > runBaselineCount) {
    return [...fromUI, ...engineMessages.slice(runBaselineCount)];
  }

  if (summaryMessage && engineMessages.length > 0 && isCompactionSummaryMessage(engineMessages[0], summaryMessage)) {
    const engineTail = engineMessages.slice(1);
    return [...fromUI.slice(0, compactIndex), ...engineTail];
  }

  if (runBaselineCount > 0 && engineMessages.length <= runBaselineCount) {
    return fromUI;
  }

  return fromUI.length >= engineMessages.length ? fromUI : engineMessages;
}
