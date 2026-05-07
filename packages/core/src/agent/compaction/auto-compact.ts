/**
 * Auto Compaction (Layer 2) - LLM-based conversation compression.
 *
 * When estimated tokens exceed the configured threshold:
 * 1. Save full conversation transcript to disk (JSONL format)
 * 2. Use a subagent to generate a summary of the conversation
 * 3. Replace messages with compressed summary + acknowledgment
 *
 * This allows agents to work indefinitely by compressing context strategically.
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

import type { CompactionConfig, CompactionResult, TranscriptEntry } from "./types.js";
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
 * Find the cut point index using a token-budget approach.
 *
 * Walks backward from the end accumulating token estimates until the
 * `keepRecentTokens` budget is exceeded, then finds the nearest valid
 * cut point (a user or assistant message, never a tool message).
 *
 * This ensures we always keep a predictable amount of recent context
 * and summarize everything before the cut.
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

  // Find the nearest valid cut point at or after rawCutIndex.
  // Valid = user or assistant message (never cut at a tool message,
  // which would orphan it from its preceding assistant).
  for (let i = rawCutIndex; i < messages.length; i++) {
    const role = messages[i].role;
    if (role === "user" || role === "assistant") {
      return i;
    }
  }

  // Fallback: if no valid cut found forward, try backward
  for (let i = rawCutIndex - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "user" || role === "assistant") {
      return i + 1;
    }
  }

  // Ultimate fallback: summarize everything
  return 0;
}

/**
 * Generate a timestamped filename for transcripts.
 */
function generateTranscriptFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `transcript_${timestamp}.jsonl`;
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
 * Save conversation transcript to disk.
 *
 * Saves messages as JSONL (one JSON line per message) for easy streaming reads.
 * Creates the transcript directory if it doesn't exist.
 *
 * @param messages - Messages to save
 * @param config - Compaction configuration
 * @param sandbox - Sandbox for filesystem access
 * @returns Path to the saved transcript file
 *
 * @example
 * ```typescript
 * const transcriptPath = await saveTranscript(messages, config, sandbox);
 * // Returns: ".transcripts/transcript_2024-01-15T10-30-00-000Z.jsonl"
 * ```
 */
export async function saveTranscript(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  sandbox: Sandbox
): Promise<string> {
  const { transcriptDir = ".transcripts" } = config;
  const fs = sandbox.filesystem;

  // Ensure transcript directory exists
  const dirExists = await fs.exists(transcriptDir);
  if (!dirExists) {
    await fs.mkdir(transcriptDir);
  }

  // Generate filename and path
  const filename = generateTranscriptFilename();
  const filePath = `${transcriptDir}/${filename}`;

  // Convert messages to JSONL format
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  for (const message of messages) {
    const entry: TranscriptEntry = {
      timestamp,
      role: message.role,
      content: message.content,
    };
    lines.push(JSON.stringify(entry));
  }

  // Write to file
  await fs.writeFile(filePath, lines.join("\n"));

  return filePath;
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
 * 1. Save transcript to disk (always, for safety)
 * 2. Summarize conversation via subagent (including any active todos)
 * 3. Return compressed messages
 *
 * If compaction fails after retries, returns the ORIGINAL messages with an error flag.
 * This ensures the user never loses their conversation context due to compaction errors.
 *
 * @param messages - Current messages array
 * @param config - Compaction configuration
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param sandbox - Sandbox for filesystem access
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with compressed messages (or original messages if failed)
 *
 * @example
 * ```typescript
 * const result = await autoCompact(messages, config, "agent-123", sandbox);
 * if (result.compacted) {
 *   messages = result.messages; // Use compressed messages
 *   console.log(`Saved transcript to ${result.transcriptPath}`);
 * } else if (result.error) {
 *   console.error(`Compaction failed: ${result.error}`);
 *   // result.messages contains original messages - nothing lost!
 * }
 *
 * // With todos included
 * const result = await autoCompact(messages, config, "agent-123", sandbox, {
 *   todos: [{ content: "Add tests", status: "pending", priority: "high" }]
 * });
 * ```
 */
export async function autoCompact(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  parentAgentId: string,
  sandbox: Sandbox,
  options?: SummarizeOptions
): Promise<CompactionResult & { messages: ModelMessage[] }> {
  const { keepRecentTokens = 20000 } = config;
  const tokensBefore = estimateTokens(messages);
  let transcriptPath: string | undefined;

  // Find cut point: keep recent tokens, summarize the rest
  const cutIndex = findCutPoint(messages, keepRecentTokens);
  const summaryMessages = messages.slice(0, cutIndex);
  const keptMessages = messages.slice(cutIndex);

  try {
    // Save transcript before compression (always do this for safety)
    transcriptPath = await saveTranscript(messages, config, sandbox);
  } catch (error) {
    // If transcript save fails, log but continue - it's not critical
    console.error("Failed to save transcript:", error);
  }

  try {
    // Generate summary via subagent with optional focus and todos
    const summary =
      summaryMessages.length > 0
        ? await summarizeConversation(summaryMessages, parentAgentId, options)
        : "No prior conversation to summarize.";

    // Create compressed messages and append kept recent messages
    const compactedMessages = createCompactedMessages(summary).concat(keptMessages);

    const tokensAfter = estimateTokens(compactedMessages);

    return {
      compacted: true,
      tokensBefore,
      tokensAfter,
      type: "auto",
      transcriptPath,
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
      transcriptPath,
      error: `Compaction failed: ${errorMessage}. Original messages preserved.`,
      messages,
    };
  }
}
