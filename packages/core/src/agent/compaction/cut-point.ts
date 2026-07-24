/**
 * Cut-point helpers for auto-compaction.
 */

import { extractTextFromContent } from "./message-utils.js";

import type { ModelMessage } from "@tanstack/ai";

/**
 * Detect and extract existing conversation summary from the first message.
 *
 * After compaction, the first message in compactMessages is always a user message
 * with format:
 *   [CONVERSATION SUMMARY]
 *   ...summary text...
 *   [END SUMMARY]
 *   ...
 *
 * When detected, we strip this message from the conversation and pass it separately
 * via <previous-summary> tags, enabling incremental (update-style) compaction.
 *
 * @returns extracted summary text and remaining messages (without the summary message)
 */
export function extractExistingSummary(messages: ModelMessage[]): {
  existingSummary?: string;
  cleanMessages: ModelMessage[];
} {
  if (messages.length === 0) return { cleanMessages: messages };

  const first = messages[0];
  if (first.role !== "user") return { cleanMessages: messages };

  const text = extractTextFromContent(first.content);

  const START_MARKER = "[CONVERSATION SUMMARY]";
  const END_MARKER = "[END SUMMARY]";

  if (!text.startsWith(START_MARKER)) return { cleanMessages: messages };

  const endIndex = text.indexOf(END_MARKER);
  if (endIndex === -1) return { cleanMessages: messages };

  const summary = text.slice(START_MARKER.length, endIndex).trim();
  if (!summary) return { cleanMessages: messages };

  return {
    existingSummary: summary,
    cleanMessages: messages.slice(1),
  };
}

/**
 * Find the cut point by keeping the latest N user messages (inclusive).
 *
 * Walks backward counting user messages. The Nth user message from the end
 * (inclusive) becomes the cut point — everything before it gets summarized,
 * the user message itself and everything after is kept.
 *
 * The optional `summaryMessageIndex` (0 if a summary message is present at
 * the head of `messages`) is excluded from counting so the previous
 * compaction summary is never treated as a "user turn".
 *
 * @returns cutIndex (messages[0..cutIndex) = to summarize,
 *          messages[cutIndex..] = to keep). Returns 0 if not enough user turns.
 */
export function findCutPoint(messages: ModelMessage[], keepRecentUserTurns: number, summaryMessageIndex = -1): number {
  if (messages.length === 0) return 0;

  let userCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    // Skip the previous compaction summary message — it's not a real user turn.
    if (i === summaryMessageIndex) continue;

    if (messages[i].role === "user") {
      userCount++;
      if (userCount === keepRecentUserTurns) {
        // Cut AT this user message (inclusive) — it stays in the kept portion.
        return i;
      }
    }
  }

  // Not enough user turns to warrant compaction.
  return 0;
}
