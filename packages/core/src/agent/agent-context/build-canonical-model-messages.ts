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
 * Rebuild the full model-message history for compaction / LLM prep.
 *
 * Merge contract:
 * - **UI** (`AgentContext.uiMessages`): durable history synced at `chat()` start; may lag mid-run.
 * - **Engine** (`onConfig` messages): authoritative for the current run — tool results are often
 *   applied in-place without growing the array length.
 * - **runBaselineCount**: model-message count at `chat()` init; splits UI prefix vs engine suffix.
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

  if (runBaselineCount > 0) {
    if (engineMessages.length > runBaselineCount) {
      return [...fromUI.slice(0, runBaselineCount), ...engineMessages.slice(runBaselineCount)];
    }

    // Same length: engine has in-place updates (e.g. tool results) that stale UI conversion lacks.
    if (engineMessages.length === runBaselineCount) {
      return engineMessages;
    }

    // Shorter than baseline: prior onConfig wrote back a compacted LLM view.
    if (engineMessages.length > 0 && engineMessages.length < runBaselineCount) {
      if (summaryMessage && isCompactionSummaryMessage(engineMessages[0], summaryMessage)) {
        return [...fromUI.slice(0, compactIndex), ...engineMessages.slice(1)];
      }
      return engineMessages;
    }
  }

  return engineMessages.length >= fromUI.length ? engineMessages : fromUI;
}
