/**
 * Auto Compaction (Layer 2) - LLM-based conversation compression.
 *
 * When estimated tokens exceed the configured threshold:
 * 1. Save full conversation transcript to disk (JSONL format)
 * 2. Use LLM to generate a summary of the conversation
 * 3. Replace messages with compressed summary + acknowledgment
 *
 * This allows agents to work indefinitely by compressing context strategically.
 */

import { generateText } from "ai";

import { buildCompactionPrompt, type CompactionTodoItem } from "./compaction-prompt.js";
import { estimateTokens } from "./token-estimator.js";

import type { CompactionConfig, CompactionResult, TranscriptEntry } from "./types.js";
import type { Sandbox } from "../../environment";
import type { LanguageModel, ModelMessage } from "ai";

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
 * Use LLM to summarize the conversation.
 *
 * @param messages - Messages to summarize
 * @param model - Language model to use for summarization
 * @param options - Optional summarization options (focus, todos)
 * @returns Summary text
 *
 * @example
 * ```typescript
 * const summary = await summarizeConversation(messages, model, { focus: "API decisions" });
 *
 * // With todos
 * const summary = await summarizeConversation(messages, model, {
 *   todos: [{ content: "Add tests", status: "pending", priority: "high" }]
 * });
 * ```
 */
export async function summarizeConversation(
  messages: ModelMessage[],
  model: LanguageModel,
  options?: SummarizeOptions
): Promise<string> {
  const { focus, todos } = options ?? {};

  // Build the conversation text for summarization
  const conversationText = messages.map(formatMessageForSummary).join("\n\n");

  // Build the summarization prompt with focus and todos
  const systemPrompt = buildCompactionPrompt({ focus, todos });

  // Call LLM for summarization
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: conversationText,
    maxOutputTokens: 4000, // Summaries should be concise
    temperature: 0.3, // Low temperature for consistent summarization
  });

  return result.text;
}

/**
 * Create the compressed message pair (summary + acknowledgment).
 *
 * @param summary - The generated summary
 * @returns Array with user summary message and assistant acknowledgment
 */
export function createCompactedMessages(summary: string): ModelMessage[] {
  return [
    {
      role: "user" as const,
      content: `[CONVERSATION SUMMARY]\n\nThe following is a summary of the previous conversation:\n\n${summary}\n\n[END SUMMARY]\n\nPlease continue from where we left off.`,
    },
    {
      role: "assistant" as const,
      content:
        "I've reviewed the conversation summary and understand the context. I'm ready to continue from where we left off. What would you like me to do next?",
    },
  ];
}

/**
 * Perform auto compaction on messages.
 *
 * This is the main entry point for Layer 2 compaction:
 * 1. Save transcript to disk
 * 2. Summarize conversation via LLM (including any active todos)
 * 3. Return compressed messages
 *
 * @param messages - Current messages array
 * @param config - Compaction configuration
 * @param model - Language model for summarization
 * @param sandbox - Sandbox for filesystem access
 * @param options - Optional summarization options (focus, todos)
 * @returns Compaction result with compressed messages
 *
 * @example
 * ```typescript
 * const result = await autoCompact(messages, config, model, sandbox);
 * if (result.compacted) {
 *   messages = result.messages; // Use compressed messages
 *   console.log(`Saved transcript to ${result.transcriptPath}`);
 * }
 *
 * // With todos included
 * const result = await autoCompact(messages, config, model, sandbox, {
 *   todos: [{ content: "Add tests", status: "pending", priority: "high" }]
 * });
 * ```
 */
export async function autoCompact(
  messages: ModelMessage[],
  config: Partial<CompactionConfig>,
  model: LanguageModel,
  sandbox: Sandbox,
  options?: SummarizeOptions
): Promise<CompactionResult & { messages: ModelMessage[] }> {
  const tokensBefore = estimateTokens(messages);

  // Save transcript before compression
  const transcriptPath = await saveTranscript(messages, config, sandbox);

  // Generate summary with optional focus and todos
  const summary = await summarizeConversation(messages, model, options);

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
