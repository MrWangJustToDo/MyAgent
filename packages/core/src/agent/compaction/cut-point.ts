/**
 * Cut-point helpers for auto-compaction.
 */

import { isTurnContextModelMessage } from "../turn-context/turn-context-message.js";

import {
  extractCompactionSummaryBody,
  hasOuterEndMarker,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
} from "./compaction-summary.js";
import { extractTextFromContent } from "./message-utils.js";

import type { ModelMessage } from "@tanstack/ai";

/**
 * Detect and extract existing conversation summary from the first message.
 *
 * After compaction, the first message in compactMessages is always a user message
 * with format:
 *   [CONVERSATION SUMMARY] / [END SUMMARY] markers (see compaction-summary.ts)
 *   ...summary text...
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
  // Only treat it as a real compact checkpoint when the outer closing marker is
  // present solo on its own line. This keeps summaries that merely quote the
  // markers (or streamed bodies without a closing marker yet) from being
  // mis-detected and swallowed.
  if (!isCompactionSummaryText(text) || !hasOuterEndMarker(text)) {
    return { cleanMessages: messages };
  }

  const summary = extractCompactionSummaryBody(text);
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
 * Skips:
 * - `summaryMessageIndex` (optional explicit index, e.g. wire-head summary)
 * - In-chain compaction summary user messages ({@link CONVERSATION_SUMMARY_START})
 * - Synthetic `<turn_context>` user messages (epoch dynamic context)
 *
 * @returns cutIndex (messages[0..cutIndex) = to summarize,
 *          messages[cutIndex..] = to keep). Returns 0 if not enough user turns.
 */
export function findCutPoint(messages: ModelMessage[], keepRecentUserTurns: number, summaryMessageIndex = -1): number {
  if (messages.length === 0) return 0;

  let userCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    // Skip an explicit summary index (wire-head) and any in-chain summary markers.
    if (i === summaryMessageIndex) continue;

    const message = messages[i]!;
    if (message.role !== "user") continue;
    if (isCompactionSummaryModelMessage(message)) continue;
    // Synthetic turn_context is not a user turn — keep looking upward.
    if (isTurnContextModelMessage(message)) continue;

    userCount++;
    if (userCount === keepRecentUserTurns) {
      // Cut AT this user message (inclusive) — it stays in the kept portion.
      return i;
    }
  }

  // Not enough user turns to warrant compaction.
  return 0;
}
