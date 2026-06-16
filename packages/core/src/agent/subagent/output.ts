/**
 * Subagent output extraction and truncation utilities.
 */

import { SUBAGENT_MAX_SUMMARY_LENGTH } from "./types.js";

/**
 * Extracts the summary from generateText result.
 *
 * The system prompt instructs the LLM to always end with a text summary,
 * so result.text should normally be sufficient. This is a safety net for
 * edge cases where the LLM ends on a tool call — we walk backward to find
 * the last step that finished with text output.
 */
export const extractSummary = (result: {
  text: string;
  steps?: Array<{ text?: string; finishReason?: string }>;
}): string => {
  if (result.steps && result.steps.length > 1) {
    for (let i = result.steps.length - 1; i >= 0; i--) {
      const step = result.steps[i];
      if (step.finishReason !== "tool-calls" && step.text?.trim()) {
        return step.text.trim();
      }
    }
  }
  return result.text?.trim() || "(no summary)";
};

/**
 * Truncates summary to max length with notice.
 */
export const truncateSummary = (
  summary: string,
  maxLength: number = SUBAGENT_MAX_SUMMARY_LENGTH
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
