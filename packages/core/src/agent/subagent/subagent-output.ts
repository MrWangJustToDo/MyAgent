/**
 * Subagent output truncation / stop-notice utilities.
 */

import { subagentStopNotice, SUBAGENT_STOP_NOTICES, type SubagentStopReason } from "./subagent-stop-reason.js";
import { SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH } from "./types.js";

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
 * Ensure a stopped run surfaces a clear notice in the summary text returned to
 * the parent (UI + `toModelOutput`), not only an `aborted` flag.
 *
 * The notice names the *reason* (user cancel, parent run moved on, parent agent
 * stopped) instead of assuming the user did it — see `subagent-stop-reason.ts`.
 */
export function applySubagentStopNotice(summary: string, reason: SubagentStopReason): string {
  const noticed = subagentStopNotice(reason);
  const trimmed = summary.trim();
  if (!trimmed || trimmed === EMPTY_SUMMARY) {
    return noticed;
  }
  // Any stop notice already in the text is the same class of message; do not stack them.
  if (SUBAGENT_STOP_NOTICES.some((notice) => trimmed.includes(notice))) return summary;
  return `${trimmed}\n\n${noticed}`;
}
