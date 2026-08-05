/**
 * Compaction summary markers and detectors (shared; no cut-point imports).
 */

import { extractTextFromContent } from "./message-utils.js";

import type { ModelMessage, UIMessage } from "@tanstack/ai";

export const CONVERSATION_SUMMARY_START = "[CONVERSATION SUMMARY]";
export const CONVERSATION_SUMMARY_END = "[END SUMMARY]";

export function isCompactionSummaryText(text: string | undefined | null): boolean {
  if (!text) return false;
  return text.trimStart().startsWith(CONVERSATION_SUMMARY_START);
}

export function isCompactionSummaryModelMessage(message: ModelMessage): boolean {
  if (message.role !== "user") return false;
  return isCompactionSummaryText(extractTextFromContent(message.content));
}

export function isCompactionSummaryUIMessage(message: UIMessage): boolean {
  if (message.role !== "user") return false;
  const textPart = message.parts.find((part) => part.type === "text");
  if (!textPart || textPart.type !== "text") return false;
  return isCompactionSummaryText(textPart.content);
}

/**
 * Extract the summary body between markers.
 * - Wrapped text → body between {@link CONVERSATION_SUMMARY_START}/{@link CONVERSATION_SUMMARY_END}
 * - Incomplete markers → undefined
 * - Unwrapped plain text → trimmed passthrough (e.g. reactive before re-wrap)
 */
export function extractCompactionSummaryBody(text: string): string | undefined {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(CONVERSATION_SUMMARY_START)) {
    const plain = text.trim();
    return plain || undefined;
  }

  const endIndex = trimmed.indexOf(CONVERSATION_SUMMARY_END);
  if (endIndex === -1) return undefined;

  const summary = trimmed.slice(CONVERSATION_SUMMARY_START.length, endIndex).trim();
  return summary || undefined;
}

export function formatCompactionSummaryContent(summary: string): string {
  return `${CONVERSATION_SUMMARY_START}

${summary}

${CONVERSATION_SUMMARY_END}

Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.`;
}
