import { convertMessagesToModelMessages, type ModelMessage, type UIMessage } from "@tanstack/ai";

/**
 * Rebuild the full model-message history for compaction / LLM prep.
 *
 * Merge contract:
 * - **UI** (channel messages): durable history at `chat()` start; may lag mid-run.
 * - **Engine** (`onConfig` messages): authoritative for the current run — tool results are often
 *   applied in-place without growing the array length.
 * - **runBaselineCount**: model-message count at `chat()` init; splits UI prefix vs engine suffix.
 *   After in-run compact projection, callers set this to `Number.MAX_SAFE_INTEGER` so later
 *   iterations prefer the projected engine (UI/engine index spaces diverge).
 *
 * Compaction summary projection is handled separately by {@link getModelVisibleMessages}.
 */
export function buildCanonicalModelMessages(
  uiMessages: UIMessage[],
  engineMessages: ModelMessage[],
  runBaselineCount = 0
): ModelMessage[] {
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

    // Shorter than baseline: prefer engine (partial / mid-rebuild) over stale UI conversion.
    if (engineMessages.length > 0 && engineMessages.length < runBaselineCount) {
      return engineMessages;
    }
  }

  return engineMessages.length >= fromUI.length ? engineMessages : fromUI;
}
