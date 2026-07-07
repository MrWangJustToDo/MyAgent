/**
 * Auto Compaction (Layer 2) - LLM-based conversation compression.
 *
 * When estimated tokens exceed the configured threshold:
 * 1. Use a subagent to generate a summary of the conversation
 * 2. Replace messages with compressed summary + acknowledgment
 *
 * This allows agents to work indefinitely by compressing context strategically.
 * Session persistence (save/restore) is handled by the session store separately.
 *
 * The summarization is done via a subagent with:
 * - No tools (pure summarization task)
 * - Custom compaction system prompt
 * - Single iteration (maxIterations: 1)
 * - No retry on empty (the prompt is explicit about output format)
 */

import { runSubagent } from "../subagent/run-subagent.js";

import { buildCompactionPrompt, COMPACTION_SYSTEM_PROMPT } from "./compaction-prompt.js";
import { extractFileOpsFromMessages, formatFileOperations } from "./file-ops-tracker.js";
import { getFirstTextPartContent } from "./message-utils.js";
import { serializeConversation } from "./serialize-conversation.js";
import { estimateTokens } from "./token-estimator.js";

import type { CompactionTodoItem } from "./compaction-prompt.js";
import type { CompactionConfig, CompactionResult } from "./types.js";
import type { AgentManager } from "../../managers/manager-agent.js";
import type { ModelMessage } from "@tanstack/ai";

// ============================================================================
// Helper Functions
// ============================================================================

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
function extractExistingSummary(messages: ModelMessage[]): { existingSummary?: string; cleanMessages: ModelMessage[] } {
  if (messages.length === 0) return { cleanMessages: messages };

  const first = messages[0];
  if (first.role !== "user") return { cleanMessages: messages };

  const text =
    typeof first.content === "string"
      ? first.content
      : Array.isArray(first.content)
        ? getFirstTextPartContent(first.content)
        : "";

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
function findCutPoint(messages: ModelMessage[], keepRecentUserTurns: number, summaryMessageIndex = -1): number {
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if auto compaction should be triggered (respects compactAtPercent).
 */
export function shouldTriggerAutoCompact(
  config: Partial<CompactionConfig>,
  options: { windowInputTokens?: number; messages?: ModelMessage[] } = {}
): boolean {
  const tokenThreshold = config.tokenThreshold ?? 100_000;
  const compactAtPercent = config.compactAtPercent ?? 80;
  const triggerAt = Math.floor(tokenThreshold * (compactAtPercent / 100));
  const { windowInputTokens = 0, messages } = options;

  if (windowInputTokens > 0) return windowInputTokens >= triggerAt;
  if (messages) return estimateTokens(messages) >= triggerAt;
  return false;
}

/** Options for summarizing a conversation */
export interface SummarizeOptions {
  /** Optional focus guidance for the summary */
  focus?: string;
  /** Optional todos to include in the summary */
  todos?: CompactionTodoItem[];
  /** Optional previous summary for incremental update (skips auto-detection) */
  existingSummary?: string;
}

/**
 * Use a subagent to summarize the conversation.
 *
 * The subagent is spawned with:
 * - No tools (pure summarization task)
 * - Custom compaction system prompt
 * - Single iteration
 * - No retry on empty output
 *
 * @param messages - Messages to summarize
 * @param parentAgentId - Parent agent ID for spawning subagent
 * @param options - Optional summarization options (focus, todos)
 * @returns Summary text
 */
export async function summarizeConversation(
  messages: ModelMessage[],
  parentAgentId: string,
  manager: AgentManager,
  options?: SummarizeOptions
): Promise<string> {
  const { focus, todos, existingSummary: explicitSummary } = options ?? {};

  // Use explicitly-provided previous summary if present; otherwise auto-detect
  // from the first message (for backward compatibility / direct callers).
  let existingSummary: string | undefined;
  let cleanMessages = messages;
  if (explicitSummary) {
    existingSummary = explicitSummary;
  } else {
    const detected = extractExistingSummary(messages);
    existingSummary = detected.existingSummary;
    cleanMessages = detected.cleanMessages;
  }

  // Serialize conversation to plain text to prevent LLM from generating tool calls.
  const conversationText = serializeConversation(cleanMessages);

  const instructionPrompt = buildCompactionPrompt({ focus, todos, existingSummary });
  const fullPrompt = `<conversation>\n${conversationText}\n</conversation>\n\n${instructionPrompt}`;

  const result = await runSubagent(
    {
      prompt: fullPrompt,
      parentAgentId,
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      tools: {},
      maxIterations: 1,
      maxOutputLength: 10000,
      autoDestroy: true,
      aggregateUsageToParent: true,
      description: "compaction",
    },
    { manager }
  );

  return result.output;
}

/**
 * Create the compressed message with the conversation summary.
 *
 * @param summary - The generated summary
 * @returns Array with just the summary as a user message
 */
export function createCompactedMessages(summary: string): ModelMessage[] {
  return [
    {
      role: "user" as const,
      content: `[CONVERSATION SUMMARY]

${summary}

[END SUMMARY]

Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.`,
    },
  ];
}

/**
 * Perform auto compaction on messages.
 *
 * The `messages` array is what `getMessagesForLLM()` returns:
 *   - First compaction:  `[m0, m1, ..., user_N, assistant, tool, ...]` (raw messages)
 *   - Later compactions: `[summaryMessage, m_k, ..., user_M, assistant, tool, ...]`
 *
 * Algorithm:
 * 1. Detect & strip the previous summary message (if present at index 0).
 * 2. Find the cut point = the Nth user message from the end (inclusive).
 * 3. Summarize everything before the cut point (excluding the stripped summary,
 *    which is fed to the summarizer as `existingSummary` for incremental updates).
 * 4. Return `cutIndex` relative to the *input* `messages` array (i.e. including
 *    the summary message offset). The caller converts it to an absolute index
 *    into the raw `context.messages` store.
 *
 * @param messages - Current LLM-visible messages (output of getMessagesForLLM)
 * @param config - Compaction configuration (uses keepRecentFlows as keepRecentUserTurns)
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with summary and cutIndex (relative to input messages)
 */
export async function autoCompact(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  parentAgentId: string,
  manager: AgentManager,
  options?: SummarizeOptions & { actualTokens?: number }
): Promise<CompactionResult> {
  const { keepRecentFlows = 2 } = config;
  const estimated = estimateTokens(messages);
  const tokensBefore = options?.actualTokens ?? estimated;

  if (messages.length === 0) {
    return { compacted: false, tokensBefore, tokensAfter: tokensBefore, type: "auto" };
  }

  // Detect previous summary message at index 0 (if any). It is excluded from
  // user-turn counting and from the slice sent to the summarizer — instead it
  // is passed via `existingSummary` for incremental update.
  const hasPrevSummary = messages[0].role === "user" && extractExistingSummary([messages[0]]).existingSummary;
  const summaryOffset = hasPrevSummary ? 1 : 0;

  // Find cut point relative to the input `messages` array.
  // Pass summaryMessageIndex so findCutPoint skips it when counting user turns.
  const llmCutIndex = findCutPoint(messages, keepRecentFlows, hasPrevSummary ? 0 : -1);

  if (llmCutIndex === 0) {
    return { compacted: false, tokensBefore, tokensAfter: tokensBefore, type: "auto" };
  }

  // Slice to summarize: everything before llmCutIndex, excluding the previous
  // summary message (it's passed as existingSummary instead).
  const toSummarize = messages.slice(summaryOffset, llmCutIndex);
  const keptMessages = messages.slice(llmCutIndex);

  // Convert cutIndex from "relative to llmMessages" to "relative to raw
  // context.messages" by subtracting the summary message offset. This makes
  // applyCompactionResult's `absoluteCut = oldCompactIndex + cutIndex` correct.
  const cutIndex = llmCutIndex - summaryOffset;

  try {
    // If there's a previous summary, pass it for incremental update.
    const prevSummary = hasPrevSummary ? extractExistingSummary([messages[0]]).existingSummary : undefined;

    const summary = await summarizeConversation(
      toSummarize,
      parentAgentId,
      manager,
      prevSummary ? { ...options, existingSummary: prevSummary } : options
    );

    const fileOps = extractFileOpsFromMessages(toSummarize);
    const summaryWithFileOps = summary + formatFileOperations(fileOps);

    const keptTokens = estimateTokens(keptMessages);
    const summaryTokens = estimateTokens(createCompactedMessages(summaryWithFileOps));

    return {
      compacted: true,
      tokensBefore,
      tokensAfter: summaryTokens + keptTokens,
      type: "auto",
      summary: summaryWithFileOps,
      cutIndex,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      compacted: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      type: "auto",
      error: `Compaction failed: ${errorMessage}. Original messages preserved.`,
    };
  }
}
