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
import { extractExistingSummary, findCutPoint } from "./cut-point.js";
import { extractFileOpsFromMessages, formatFileOperations } from "./file-ops-tracker.js";
import { buildSegmentedConversationText } from "./serialize-conversation.js";
import { resolveSummarizationInputBudget, splitMessagesByTokenBudget } from "./summarization-budget.js";
import { estimateTokens } from "./token-estimator.js";
import { maybeAppendCompactArchive } from "./write-compact-archive.js";

import type { CompactionTodoItem } from "./compaction-prompt.js";
import type { CompactionConfig, CompactionResult } from "./types.js";
import type { AgentManager } from "../../managers/manager-agent.js";
import type { ModelMessage } from "@tanstack/ai";

export { extractExistingSummary, findCutPoint } from "./cut-point.js";

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
  /**
   * Recent turns that remain after compaction. Included in the summarizer prompt
   * under `<still_in_context>` for alignment; not applied as part of the cut.
   */
  stillInContext?: ModelMessage[];
}

/**
 * Build the full summarizer user prompt (segments + instructions) without calling the LLM.
 * Exported for validation scripts.
 */
export function buildSummarizationUserPrompt(toCompress: ModelMessage[], options?: SummarizeOptions): string {
  const { focus, todos, existingSummary, stillInContext } = options ?? {};
  const conversationText = buildSegmentedConversationText(toCompress, stillInContext);
  const instructionPrompt = buildCompactionPrompt({
    focus,
    todos,
    existingSummary,
    hasStillInContext: Boolean(stillInContext?.length),
  });
  return `${conversationText}\n\n${instructionPrompt}`;
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

  let existingSummary: string | undefined;
  let cleanMessages = messages;
  if (explicitSummary) {
    existingSummary = explicitSummary;
  } else {
    const detected = extractExistingSummary(messages);
    existingSummary = detected.existingSummary;
    cleanMessages = detected.cleanMessages;
  }

  const stillInContext = options?.stillInContext;
  const inputBudget = resolveSummarizationInputBudget(manager, parentAgentId);
  // Prefer keeping still_in_context in budget; batch only the to-compress slice.
  const stillTokens = stillInContext?.length ? estimateTokens(stillInContext) : 0;
  const compressBudget = Math.max(8_000, inputBudget - stillTokens);
  const batches = splitMessagesByTokenBudget(cleanMessages, compressBudget);

  if (batches.length <= 1) {
    return summarizeConversationBatch(cleanMessages, parentAgentId, manager, {
      focus,
      todos,
      existingSummary,
      stillInContext,
    });
  }

  const partialSummaries: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const batchFocus =
      focus != null
        ? `${focus} (segment ${i + 1} of ${batches.length})`
        : `Summarize segment ${i + 1} of ${batches.length} of the conversation`;
    partialSummaries.push(
      await summarizeConversationBatch(batch, parentAgentId, manager, {
        focus: batchFocus,
        todos: i === batches.length - 1 ? todos : undefined,
        existingSummary: i === 0 ? existingSummary : undefined,
        // Align with kept turns only on the final merge step.
      })
    );
  }

  const mergedInput = partialSummaries.map((summary, index) => `## Segment ${index + 1}\n\n${summary}`).join("\n\n");
  return summarizeConversationBatch([{ role: "user", content: mergedInput }], parentAgentId, manager, {
    focus: focus ?? "Merge the segment summaries into one cohesive continuation prompt for the next agent",
    todos,
    existingSummary,
    stillInContext,
  });
}

async function summarizeConversationBatch(
  messages: ModelMessage[],
  parentAgentId: string,
  manager: AgentManager,
  options?: SummarizeOptions
): Promise<string> {
  const fullPrompt = buildSummarizationUserPrompt(messages, options);

  const result = await runSubagent(
    {
      prompt: fullPrompt,
      parentAgentId,
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      tools: {},
      maxIterations: 1,
      maxOutputLength: 40000,
      autoDestroy: true,
      aggregateUsageToParent: true,
      description: "compaction",
      bridgeUI: false,
    },
    { manager }
  );

  const output = result.output?.trim() ?? "";
  if (!output || output === "(no summary)") {
    throw new Error(
      `Compaction subagent returned no summary (tokens=${result.usage.totalTokens}, ` +
        `incomplete=${result.incomplete}, reachedLimit=${result.reachedLimit}, aborted=${result.aborted})`
    );
  }

  return output;
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
 * 3. Summarize with segmented input: `<to_compress>` (pre-cut) + `<still_in_context>`
 *    (kept turns). Previous summary is fed as `existingSummary` for incremental updates.
 * 4. Optionally archive the compressed slice and append a pointer to the summary.
 * 5. Return `cutIndex` relative to the *input* `messages` array (i.e. including
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
  // summary message (it's passed as existingSummary instead). Kept turns are
  // passed as stillInContext for summarizer alignment only.
  const toSummarize = messages.slice(summaryOffset, llmCutIndex);
  const keptMessages = messages.slice(llmCutIndex);

  // Convert cutIndex from "relative to llmMessages" to "relative to raw
  // context.messages" by subtracting the summary message offset. This makes
  // applyCompactionResult's `absoluteCut = oldCompactIndex + cutIndex` correct.
  const cutIndex = llmCutIndex - summaryOffset;

  try {
    // If there's a previous summary, pass it for incremental update.
    const prevSummary = hasPrevSummary ? extractExistingSummary([messages[0]]).existingSummary : undefined;

    const summary = await summarizeConversation(toSummarize, parentAgentId, manager, {
      ...options,
      ...(prevSummary ? { existingSummary: prevSummary } : {}),
      stillInContext: keptMessages,
    });

    const fileOps = extractFileOpsFromMessages(toSummarize);
    let summaryWithFileOps = summary + formatFileOperations(fileOps);

    const managed = manager.getAgent(parentAgentId);
    const sessionId = managed?.getSessionData()?.id ?? parentAgentId;
    summaryWithFileOps = await maybeAppendCompactArchive(summaryWithFileOps, {
      sessionId,
      messages: toSummarize,
      cutIndex,
    });

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
