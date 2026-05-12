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

import { runSubagent } from "../subagent/subagent.js";

import { buildCompactionPrompt, COMPACTION_SYSTEM_PROMPT, type CompactionTodoItem } from "./compaction-prompt.js";
import { estimateMessageTokens, estimateTokens } from "./token-estimator.js";

import type { CompactionConfig, CompactionResult } from "./types.js";
import type { Sandbox } from "../../environment/types.js";
import type { ModelMessage } from "ai";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Strip media (images, files) from messages for summarization.
 * This reduces token usage and avoids issues with vision models.
 */
function stripMediaFromMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message;
    }

    if (!Array.isArray(message.content)) {
      return message;
    }

    // Replace media parts with descriptive placeholders, keep text and tool parts
    const filteredContent = message.content
      .map((part) => {
        const p = part as Record<string, unknown>;
        const type = p.type as string | undefined;

        // Replace image/file attachments with descriptive placeholders
        if (type === "image") {
          const mediaType = (p.mediaType as string) || "image";
          return {
            type: "text",
            text: `[Image was attached here (${mediaType}). The image content was already seen and discussed in this conversation.]`,
          };
        }

        if (type === "file") {
          const mediaType = (p.mediaType as string) || "unknown";
          const filename = (p.filename as string) || "";
          const label = filename ? `${filename} (${mediaType})` : mediaType;
          if (mediaType.startsWith("image/")) {
            return {
              type: "text",
              text: `[Image file was attached: ${label}. The image content was already seen and discussed in this conversation.]`,
            };
          }
          return { type: "text", text: `[File was attached: ${label}]` };
        }

        // Keep everything else
        return part;
      })
      .filter(Boolean);

    return {
      ...message,
      content: filteredContent.length > 0 ? filteredContent : [{ type: "text", text: "[Empty message]" }],
    } as ModelMessage;
  });
}

/**
 * Check whether an assistant message contains tool calls.
 */
function hasToolCalls(message: ModelMessage): boolean {
  if (message.role !== "assistant") return false;
  const content = message.content;
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    const p = part as Record<string, unknown>;
    return p.type === "tool-call";
  });
}

/**
 * Find the cut point index using a token-budget approach.
 *
 * Walks backward from the end accumulating token estimates until the
 * `keepRecentTokens` budget is exceeded, then finds the nearest valid
 * cut point that won't orphan tool messages from their assistant.
 *
 * A valid cut point must satisfy:
 * 1. It's a user or assistant message (never a tool message)
 * 2. The kept messages (from cutIndex onward) don't start with tool
 *    messages that belong to a summarized assistant
 * 3. An assistant(tool_calls) message isn't separated from its tool results
 */
function findCutPoint(messages: ModelMessage[], keepRecentTokens: number): number {
  if (messages.length === 0) return 0;

  let accumulated = 0;
  let rawCutIndex = 0;

  // Walk backward, accumulating token estimates
  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += estimateMessageTokens(messages[i]);
    if (accumulated >= keepRecentTokens) {
      rawCutIndex = i;
      break;
    }
  }

  // If we never exceeded the budget, keep everything (cut at 0 = summarize nothing)
  if (accumulated < keepRecentTokens) {
    return 0;
  }

  // Find a valid cut point at or after rawCutIndex.
  // Must be a user message, or an assistant message that is NOT followed
  // by tool results that would get orphaned.
  for (let i = rawCutIndex; i < messages.length; i++) {
    const role = messages[i].role;
    if (role === "tool") continue;

    if (role === "user") {
      return i;
    }

    if (role === "assistant") {
      // If this assistant has tool_calls, we must include it AND all its
      // subsequent tool results in the kept portion — so this is a valid cut.
      // If it doesn't have tool_calls, it's also safe to cut here.
      return i;
    }
  }

  // Backward fallback: find the nearest user or assistant going back,
  // but make sure we don't land just after an assistant(tool_calls)
  // whose tool results would become the start of keptMessages.
  for (let i = rawCutIndex - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "user" || role === "assistant") {
      const candidateCut = i + 1;
      // Verify the kept portion doesn't start with orphaned tool messages
      if (candidateCut < messages.length && messages[candidateCut].role === "tool") {
        // This would orphan tool messages — include the assistant(tool_calls) too
        if (hasToolCalls(messages[i])) {
          return i;
        }
        // The tool message belongs to an even earlier assistant; keep scanning back
        continue;
      }
      return candidateCut;
    }
  }

  // Ultimate fallback: summarize everything
  return 0;
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
 *
 * @example
 * ```typescript
 * // Using actual token count from context
 * const usage = context.getUsage();
 * if (shouldAutoCompact(usage.inputTokens, config)) {
 *   const result = await autoCompact(messages, config, model, sandbox);
 * }
 *
 * // Using message estimation (fallback)
 * if (shouldAutoCompact(messages, config)) {
 *   const result = await autoCompact(messages, config, model, sandbox);
 * }
 * ```
 */
export function shouldAutoCompact(
  tokensOrMessages: number | ModelMessage[],
  config: Partial<CompactionConfig> = {}
): boolean {
  const { tokenThreshold = 100000 } = config;

  // If a number is passed, use it directly as the token count
  if (typeof tokensOrMessages === "number") {
    return tokensOrMessages >= tokenThreshold;
  }

  // Otherwise estimate from messages
  const estimatedTokens = estimateTokens(tokensOrMessages);
  return estimatedTokens >= tokenThreshold;
}

/**
 * Options for summarizing a conversation
 */
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
 *
 * @example
 * ```typescript
 * const summary = await summarizeConversation(messages, "agent-123", { focus: "API decisions" });
 *
 * // With todos
 * const summary = await summarizeConversation(messages, "agent-123", {
 *   todos: [{ content: "Add tests", status: "pending", priority: "high" }]
 * });
 * ```
 */
export async function summarizeConversation(
  messages: ModelMessage[],
  parentAgentId: string,
  options?: SummarizeOptions
): Promise<string> {
  const { focus, todos } = options ?? {};

  // Build the summarization instruction prompt (this becomes the final user message)
  const summarizationPrompt = buildCompactionPrompt({ focus, todos });

  // Strip media from messages for summarization (like OpenCode does)
  const strippedMessages = stripMediaFromMessages(messages);

  // Run subagent for summarization
  // - systemPrompt: tells the LLM it's a summarizer (not a conversational agent)
  // - initialMessages: the conversation history to summarize
  // - prompt: the instruction template (becomes final user message)
  // - retryOnEmpty: true - use subagent's built-in retry logic
  const result = await runSubagent({
    prompt: summarizationPrompt,
    initialMessages: strippedMessages, // Pass conversation as context
    parentAgentId,
    systemPrompt: COMPACTION_SYSTEM_PROMPT, // Tell LLM its role is to summarize
    tools: {}, // No tools - pure summarization
    maxIterations: 1, // Single pass
    maxOutputLength: 10000, // Allow longer summaries for compaction
    retryOnEmpty: true, // Use subagent's built-in retry logic
    autoDestroy: true, // Clean up after
    aggregateUsageToParent: true, // Track usage
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
  // Only include the summary as context - no fake assistant response needed.
  // The agent will naturally continue from whatever the user sends next.
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
 * This is the main entry point for Layer 2 compaction:
 * 1. Summarize conversation via subagent (including any active todos)
 * 2. Return compressed messages
 *
 * If compaction fails, returns the ORIGINAL messages with an error flag.
 * This ensures the user never loses their conversation context due to compaction errors.
 * Session persistence is handled separately by the session store.
 *
 * @param messages - Current messages array
 * @param config - Compaction configuration
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param sandbox - Sandbox (kept for API compatibility)
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with compressed messages (or original messages if failed)
 *
 * @example
 * ```typescript
 * const result = await autoCompact(messages, config, "agent-123", sandbox);
 * if (result.compacted) {
 *   messages = result.messages; // Use compressed messages
 * } else if (result.error) {
 *   console.error(`Compaction failed: ${result.error}`);
 * }
 * ```
 */
export async function autoCompact(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  parentAgentId: string,
  sandbox: Sandbox,
  options?: SummarizeOptions & { actualTokens?: number }
): Promise<CompactionResult & { messages: ModelMessage[] }> {
  const { keepRecentTokens = 20000 } = config;
  const estimated = estimateTokens(messages);
  const tokensBefore = options?.actualTokens ?? estimated;

  // Scale keepRecentTokens if actual token count diverges from estimation.
  // estimateTokens uses chars/4 which underestimates heavily for micro-compacted messages.
  // Use the ratio to correct findCutPoint's budget so it doesn't keep everything.
  let scaledKeepRecent = keepRecentTokens;
  if (options?.actualTokens && estimated > 0) {
    const ratio = estimated / options.actualTokens;
    scaledKeepRecent = Math.floor(keepRecentTokens * ratio);
  }

  // Find cut point: keep recent tokens, summarize the rest
  const cutIndex = findCutPoint(messages, scaledKeepRecent);

  // Nothing to summarize — everything fits within the keep-recent budget
  if (cutIndex === 0) {
    return {
      compacted: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      type: "auto",
      messages,
    };
  }

  // Walk the cut backward if keptMessages would start with orphaned tool messages.
  // This is a safety net — findCutPoint should already handle this, but we
  // guard against edge cases where the message structure is unexpected.
  let safeCutIndex = cutIndex;
  while (safeCutIndex > 0 && messages[safeCutIndex].role === "tool") {
    safeCutIndex--;
  }
  // If we moved back and landed on an assistant with tool_calls, include it
  if (safeCutIndex < cutIndex && safeCutIndex > 0 && messages[safeCutIndex].role !== "user") {
    // Keep going back to find a user message or assistant without dangling tools
    while (safeCutIndex > 0 && messages[safeCutIndex].role === "tool") {
      safeCutIndex--;
    }
  }
  // If safeCutIndex is 0 and it's a tool message, summarize everything
  if (safeCutIndex === 0 && messages[0].role === "tool") {
    return {
      compacted: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      type: "auto",
      messages,
    };
  }

  const summaryMessages = messages.slice(0, safeCutIndex);
  const keptMessages = messages.slice(safeCutIndex);

  try {
    // Generate summary via subagent with optional focus and todos
    const summary = await summarizeConversation(summaryMessages, parentAgentId, options);

    // Create compressed messages and append kept recent messages
    const compactedMessages = createCompactedMessages(summary).concat(keptMessages);

    const tokensAfter = estimateTokens(compactedMessages);

    return {
      compacted: true,
      tokensBefore,
      tokensAfter,
      type: "auto",
      summary,
      messages: compactedMessages,
    };
  } catch (error) {
    // Compaction failed — return ORIGINAL messages so user doesn't lose anything
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      compacted: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      type: "auto",
      error: `Compaction failed: ${errorMessage}. Original messages preserved.`,
      messages,
    };
  }
}
