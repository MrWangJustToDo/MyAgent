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
 * Get text content from the first text part of a content array.
 * Needed because strict SDK types prevent casting to Record for find().
 */
function getFirstTextPartContent(content: Array<unknown>): string {
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        return p.text;
      }
    }
  }
  return "";
}

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
function extractExistingSummary(
  messages: ModelMessage[]
): { existingSummary?: string; cleanMessages: ModelMessage[] } {
  if (messages.length === 0) return { cleanMessages: messages };

  const first = messages[0];
  if (first.role !== "user") return { cleanMessages: messages };

  const text =
    typeof first.content === "string"
      ? first.content
      : Array.isArray(first.content)
        ? getFirstTextPartContent(first.content)
        : "";

  // Match [CONVERSATION SUMMARY] ... [END SUMMARY] at the start of the message
  const match = text.match(/^\[CONVERSATION SUMMARY\]\n\n([\s\S]*?)\n\n\[END SUMMARY\]/);
  if (!match) return { cleanMessages: messages };

  return {
    existingSummary: match[1].trim(),
    cleanMessages: messages.slice(1),
  };
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
// File Operation Tracking
// ============================================================================

/**
 * Tracked file operations from tool calls.
 * Used to append an accurate file list to the compaction summary,
 * so the LLM doesn't have to rely on memory to list which files were involved.
 */
interface FileOps {
  /** Files that were read (read_file, list_file, tree, etc.) */
  readFiles: Set<string>;
  /** Files that were created or modified (write_file, edit_file, search_replace, etc.) */
  modifiedFiles: Set<string>;
}

/** Tools that read file content or structure */
const READ_TOOLS = new Set(["read_file", "list_file", "tree"]);

/** Tools that create or modify files */
const WRITE_TOOLS = new Set(["write_file", "edit_file", "search_replace", "copy_file", "move_file", "delete_file"]);

/**
 * Extract a string path field from a tool-call's args.
 * Handles both object args and JSON-string args.
 */
function extractPathFromArgs(args: unknown, field: string): string | undefined {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      const val = parsed[field];
      return typeof val === "string" && val.length > 0 ? val : undefined;
    } catch {
      return undefined;
    }
  }
  if (args && typeof args === "object") {
    const val = (args as Record<string, unknown>)[field];
    return typeof val === "string" && val.length > 0 ? val : undefined;
  }
  return undefined;
}

/**
 * Extract file operations from assistant tool-call messages.
 *
 * Scans all assistant messages for tool-call parts and tracks:
 * - Files read: read_file, list_file, tree calls
 * - Files modified: write_file, edit_file, search_replace, copy_file, move_file, delete_file
 *
 * @param messages - Messages to scan for tool calls
 * @returns Deduplicated sets of read and modified file paths
 *
 * @example
 * ```typescript
 * const ops = extractFileOpsFromMessages(messages);
 * console.log(ops.readFiles);   // Set {"src/index.ts", "package.json"}
 * console.log(ops.modifiedFiles); // Set {"src/new-file.ts"}
 * ```
 */
function extractFileOpsFromMessages(messages: ModelMessage[]): FileOps {
  const ops: FileOps = { readFiles: new Set(), modifiedFiles: new Set() };

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    const content = message.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const p = part as Record<string, unknown>;
      if (p.type !== "tool-call") continue;

      const toolName = p.toolName as string | undefined;
      if (!toolName) continue;

      const args = p.args;

      if (READ_TOOLS.has(toolName)) {
        const path = extractPathFromArgs(args, "path");
        if (path && path !== "." && path !== "./") {
          ops.readFiles.add(path);
        }
      } else if (WRITE_TOOLS.has(toolName)) {
        if (toolName === "copy_file" || toolName === "move_file") {
          // Both source and target are relevant for these operations
          const sourcePath = extractPathFromArgs(args, "sourcePath");
          const targetPath = extractPathFromArgs(args, "targetPath");
          if (targetPath) ops.modifiedFiles.add(targetPath);
          if (toolName === "move_file" && sourcePath) ops.modifiedFiles.add(sourcePath);
          if (toolName === "copy_file" && sourcePath) ops.readFiles.add(sourcePath);
        } else {
          const path = extractPathFromArgs(args, "path");
          if (path) ops.modifiedFiles.add(path);
        }
      }
    }
  }

  return ops;
}

/**
 * Format file operations into markdown sections for appending to a summary.
 *
 * Returns empty string if no operations were tracked.
 *
 * @param ops - File operations to format
 * @returns Markdown string with "Files Read" and/or "Files Modified" sections
 */
function formatFileOperations(ops: FileOps): string {
  const parts: string[] = [];

  if (ops.readFiles.size > 0) {
    parts.push("## Files Read");
    for (const f of [...ops.readFiles].sort()) {
      parts.push(`- \`${f}\``);
    }
  }

  if (ops.modifiedFiles.size > 0) {
    parts.push("## Files Modified");
    for (const f of [...ops.modifiedFiles].sort()) {
      parts.push(`- \`${f}\``);
    }
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n") : "";
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

  // Detect existing summary from the first message (incremental update).
  // If found: the old summary is passed via <previous-summary> tags in the prompt,
  // and cleanMessages excludes it so the subagent only sees NEW messages.
  // If not found: first-time compaction, summarize everything normally.
  const { existingSummary, cleanMessages } = extractExistingSummary(messages);

  // Build prompt — uses UPDATE_COMPACTION_PROMPT if existingSummary is provided,
  // wraps it in <previous-summary> tags for explicit context preservation.
  const summarizationPrompt = buildCompactionPrompt({
    focus,
    todos,
    existingSummary,
  });

  // Strip media from the CLEAN messages (without the old summary message).
  // For update mode: initialMessages only contains messages since last compaction.
  const strippedMessages = stripMediaFromMessages(cleanMessages);

  // Run subagent for summarization
  // - systemPrompt: tells the LLM it's a summarizer (not a conversational agent)
  // - initialMessages: the conversation history to summarize (NEW messages only in update mode)
  // - prompt: the instruction template (includes <previous-summary> tags in update mode)
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

    // Augment summary with tracked file operations from the summarized messages.
    // This provides accurate file lists without relying on LLM memory.
    const fileOps = extractFileOpsFromMessages(summaryMessages);
    const summaryWithFileOps = summary + formatFileOperations(fileOps);

    // Create compressed messages and append kept recent messages
    const compactedMessages = createCompactedMessages(summaryWithFileOps).concat(keptMessages);

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
