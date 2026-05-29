/**
 * Reactive Compact (Emergency) - Emergency compaction when API returns prompt_too_long.
 *
 * Despite the proactive layers (micro → auto), context can still grow too fast
 * for compression triggers. This emergency handler:
 *
 * 1. Uses LLM to generate a summary (via existing summarizeConversation)
 * 2. Keeps only the summary + last N messages
 *
 * The reactive compact is more aggressive than auto-compact — it retains fewer
 * tail messages and replaces everything else with a summary.
 *
 * Max retries: 1 (configurable). After that, the error propagates.
 */

import { createCompactedMessages, summarizeConversation } from "./auto-compact.js";

import type { ModelMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

/** Default maximum reactive retries */
const DEFAULT_MAX_REACTIVE_RETRIES = 1;

/** Default number of recent messages to keep in reactive compact */
const DEFAULT_REACTIVE_KEEP_TAIL = 5;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a prompt_too_long error.
 */
export function isPromptTooLongError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("prompt_too_long") ||
    lower.includes("too many tokens") ||
    lower.includes("max tokens exceeded") ||
    lower.includes("context length exceeded") ||
    lower.includes("too large") ||
    lower.includes("maximum context length")
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Configuration for reactive compaction.
 */
export interface ReactiveCompactConfig {
  /** Maximum reactive retry attempts (default: 1) */
  maxReactiveRetries?: number;
  /** Number of recent messages to keep in reactive compact (default: 5) */
  keepTail?: number;
}

/**
 * Perform reactive compaction — emergency compression triggered when the
 * API returns a prompt_too_long error despite the proactive layers.
 *
 * Steps:
 * 1. Summarize the conversation using the LLM (via summarizeConversation)
 * 2. Keep only the summary + the last N messages
 *
 * Session recovery is handled by the session store (JSONL), so no separate
 * transcript is needed — the session already captures full history.
 *
 * @param messages - Current messages that caused the prompt_too_long error
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param compactionConfig - Regular compaction config (passed to summarizer)
 * @returns Compacted messages array (summary + tail)
 *
 * @example
 * ```typescript
 * const compacted = await reactiveCompact(messages, "agent-123");
 * // Returns: [summary-message, ...recent-messages]
 * ```
 */
export async function reactiveCompact(
  messages: ModelMessage[],
  parentAgentId: string,
  config: ReactiveCompactConfig = {}
): Promise<ModelMessage[]> {
  const { keepTail = DEFAULT_REACTIVE_KEEP_TAIL } = config;

  if (messages.length === 0) return messages;

  // Split into summary portion and tail
  const keepCount = Math.min(keepTail, messages.length - 1);
  const tailMessages = messages.slice(-keepCount);
  const summaryMessages = messages.slice(0, -keepCount);

  let summary: string;

  try {
    // Generate LLM summary of the older portion
    summary = await summarizeConversation(summaryMessages, parentAgentId, {
      focus: "Emergency compaction — preserve all critical information for continuing work",
    });
  } catch {
    // If summarization fails, use a simple fallback so the session isn't lost
    summary = `[Emergency reactive compaction performed. ${summaryMessages.length} messages summarized. Full history is preserved in session storage. Please read relevant files to re-establish detailed context.]`;
  }

  // Build compacted messages: summary + recent tail
  const compacted = createCompactedMessages(`[Reactive Compact]\n\n${summary}`);

  return [...compacted, ...tailMessages];
}

/**
 * Maximum reactive retry attempts.
 * Defaults to 1 — if the first retry also fails, the error propagates.
 */
export function getMaxReactiveRetries(config?: ReactiveCompactConfig): number {
  return config?.maxReactiveRetries ?? DEFAULT_MAX_REACTIVE_RETRIES;
}
