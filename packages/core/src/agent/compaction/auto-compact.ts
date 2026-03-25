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

import { buildCompactionPrompt, type CompactionTodoItem } from "./compaction-prompt.js";
import { estimateTokens } from "./token-estimator.js";

import type { CompactionConfig, CompactionResult, TranscriptEntry } from "./types.js";
import type { Sandbox } from "../../environment/types.js";
import type { ModelMessage } from "ai";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a message for inclusion in the summarization prompt.
 */
function formatMessageForSummary(message: ModelMessage): string {
  const role = message.role.toUpperCase();

  if (typeof message.content === "string") {
    return `[${role}]: ${message.content}`;
  }

  // For complex content (parts array), stringify it
  try {
    const contentStr = JSON.stringify(message.content, null, 2);
    return `[${role}]: ${contentStr}`;
  } catch {
    return `[${role}]: [Complex content]`;
  }
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
  const { enabled = true, tokenThreshold = 100000 } = config;

  if (!enabled) {
    return false;
  }

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

  // Build the conversation text for summarization
  const conversationText = messages.map(formatMessageForSummary).join("\n\n");

  // Build the summarization prompt with focus and todos
  const systemPrompt = buildCompactionPrompt({ focus, todos });

  // Run subagent for summarization
  const result = await runSubagent({
    prompt: conversationText,
    parentAgentId,
    systemPrompt,
    tools: {}, // No tools - pure summarization
    maxIterations: 1, // Single pass
    maxOutputLength: 10000, // Allow longer summaries for compaction
    retryOnEmpty: false, // Don't retry - prompt is explicit
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
 * @returns Array with just the summary as a system/user message
 */
export function createCompactedMessages(summary: string): ModelMessage[] {
  // Only include the summary as context - no fake assistant response needed.
  // The agent will naturally continue from whatever the user sends next.
  return [
    {
      role: "user" as const,
      content: `[CONVERSATION SUMMARY]\n\nThe following is a summary of the previous conversation:\n\n${summary}\n\n[END SUMMARY]\n\nPlease continue from where we left off.`,
    },
  ];
}

/**
 * Perform auto compaction on messages.
 *
 * This is the main entry point for Layer 2 compaction:
 * 1. Save transcript to disk
 * 2. Summarize conversation via subagent (including any active todos)
 * 3. Return compressed messages
 *
 * @param messages - Current messages array
 * @param config - Compaction configuration
 * @param parentAgentId - Parent agent ID for spawning summarization subagent
 * @param sandbox - Sandbox for filesystem access
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with compressed messages
 *
 * @example
 * ```typescript
 * const result = await autoCompact(messages, config, "agent-123", sandbox);
 * if (result.compacted) {
 *   messages = result.messages; // Use compressed messages
 *   console.log(`Saved transcript to ${result.transcriptPath}`);
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
  const tokensBefore = estimateTokens(messages);

  // Save transcript before compression
  const transcriptPath = await saveTranscript(messages, config, sandbox);

  // Generate summary via subagent with optional focus and todos
  const summary = await summarizeConversation(messages, parentAgentId, options);

  // Create compressed messages
  const compactedMessages = createCompactedMessages(summary);

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
}
