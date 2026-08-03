/**
 * Subagent output truncation / cancel-notice utilities.
 */

import { SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH } from "./types.js";

/** Appended to task tool summary (and shown to the parent model) when Esc cancels a subagent. */
export const SUBAGENT_CANCELLED_NOTICE = "[Task cancelled by user.]";

const EMPTY_SUMMARY = "(no summary)";

/**
 * Truncates summary to max length with notice.
 */
export const truncateSummary = (
  summary: string,
  maxLength: number = SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH
): { summary: string; truncated: boolean } => {
  if (summary.length <= maxLength) {
    return { summary, truncated: false };
  }

  const truncated = summary.slice(0, maxLength);
  const notice = `\n\n[Summary truncated at ${maxLength} characters]`;

  return {
    summary: truncated + notice,
    truncated: true,
  };
};

/**
 * Ensure cancelled runs surface a clear notice in the summary text returned to
 * the parent (UI + `toModelOutput`), not only an `aborted` flag.
 */
export function applySubagentCancelNotice(summary: string, aborted: boolean): string {
  if (!aborted) return summary;

  const trimmed = summary.trim();
  if (!trimmed || trimmed === EMPTY_SUMMARY) {
    return SUBAGENT_CANCELLED_NOTICE;
  }
  if (trimmed.includes(SUBAGENT_CANCELLED_NOTICE)) return summary;
  return `${trimmed}\n\n${SUBAGENT_CANCELLED_NOTICE}`;
}
