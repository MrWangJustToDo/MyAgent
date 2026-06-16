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

import { runSubagent } from "../subagent/runner.js";

import { buildCompactionPrompt, COMPACTION_SYSTEM_PROMPT } from "./compaction-prompt.js";
import { extractFileOpsFromMessages, formatFileOperations } from "./file-ops-tracker.js";
import { getFirstTextPartContent } from "./message-utils.js";
import { serializeConversation } from "./serialize-conversation.js";
import { estimateTokens } from "./token-estimator.js";

import type { CompactionTodoItem } from "./compaction-prompt.js";
import type { CompactionConfig, CompactionResult } from "./types.js";
import type { ModelMessage } from "ai";

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
 * Find the cut point by keeping the latest N assistant-tool flows.
 *
 * A "flow" is an assistant message followed by its tool result messages.
 * We walk backward counting flows, and cut before the Nth flow from the end.
 * Everything before the cut point gets summarized.
 */
function findCutPoint(messages: ModelMessage[], keepRecentFlows: number): number {
  if (messages.length === 0) return 0;

  let flowCount = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role;

    if (role === "assistant" || role === "user") {
      flowCount++;
      if (flowCount > keepRecentFlows) {
        cutIndex = i;
        break;
      }
    }
  }

  if (flowCount <= keepRecentFlows) {
    return 0;
  }

  if (cutIndex > 0 && messages[cutIndex].role === "user") {
    return cutIndex;
  }

  for (let i = cutIndex + 1; i < messages.length; i++) {
    if (messages[i].role === "user") {
      return i;
    }
  }

  return cutIndex;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if auto compaction should be triggered based on token threshold.
 *
 * @param tokensOrMessages - Either actual token count (number) or messages array for estimation
 * @param config - Compaction configuration
 * @returns True if tokens exceed threshold
 */
export function shouldAutoCompact(
  tokensOrMessages: number | ModelMessage[],
  config: Partial<CompactionConfig> = {}
): boolean {
  const { tokenThreshold = 100000 } = config;

  if (typeof tokensOrMessages === "number") {
    return tokensOrMessages >= tokenThreshold;
  }

  const estimatedTokens = estimateTokens(tokensOrMessages);
  return estimatedTokens >= tokenThreshold;
}

/** Options for summarizing a conversation */
export interface SummarizeOptions {
  /** Optional focus guidance for the summary */
  focus?: string;
  /** Optional todos to include in the summary */
  todos?: CompactionTodoItem[];
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
  options?: SummarizeOptions
): Promise<string> {
  const { focus, todos } = options ?? {};

  // Detect existing summary (incremental update).
  const { existingSummary, cleanMessages } = extractExistingSummary(messages);

  // Serialize conversation to plain text to prevent LLM from generating tool calls.
  const conversationText = serializeConversation(cleanMessages);

  const instructionPrompt = buildCompactionPrompt({ focus, todos, existingSummary });
  const fullPrompt = `<conversation>\n${conversationText}\n</conversation>\n\n${instructionPrompt}`;

  const result = await runSubagent({
    prompt: fullPrompt,
    parentAgentId,
    systemPrompt: COMPACTION_SYSTEM_PROMPT,
    tools: {},
    maxIterations: 1,
    maxOutputLength: 10000,
    retryOnEmpty: true,
    autoDestroy: true,
    aggregateUsageToParent: true,
    description: "compaction",
  });

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
 * Splits messages using keepRecentFlows: summarizes older messages, keeps recent ones.
 * Returns the summary and cutIndex so the caller can set summaryMessage and compactIndex.
 *
 * @param messages - Current LLM-visible messages
 * @param config - Compaction configuration (uses keepRecentFlows for splitting)
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with summary and cutIndex
 */
export async function autoCompact(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  parentAgentId: string,
  options?: SummarizeOptions & { actualTokens?: number }
): Promise<CompactionResult> {
  const { keepRecentFlows = 4 } = config;
  const estimated = estimateTokens(messages);
  const tokensBefore = options?.actualTokens ?? estimated;

  if (messages.length === 0) {
    return { compacted: false, tokensBefore, tokensAfter: tokensBefore, type: "auto" };
  }

  const cutIndex = findCutPoint(messages, keepRecentFlows);

  if (cutIndex === 0) {
    return { compacted: false, tokensBefore, tokensAfter: tokensBefore, type: "auto" };
  }

  const summaryMessages = messages.slice(0, cutIndex);
  const keptMessages = messages.slice(cutIndex);

  try {
    const summary = await summarizeConversation(summaryMessages, parentAgentId, options);

    const fileOps = extractFileOpsFromMessages(summaryMessages);
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
