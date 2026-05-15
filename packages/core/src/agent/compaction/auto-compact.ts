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
import { estimateTokens } from "./token-estimator.js";

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

  // Detect [CONVERSATION SUMMARY] ... [END SUMMARY] at the start of the message.
  // Uses startsWith/endsWith instead of regex for robustness against spacing variations.
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
 * The message pattern looks like:
 *   [user] [assistant] [tool]* [assistant] [tool]* [assistant] [tool]* ...
 *
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
        // Cut right after this assistant message's preceding user message (if any),
        // or at this assistant message itself
        cutIndex = i;
        break;
      }
    }
  }

  // If we didn't find enough flows, nothing to compact
  if (flowCount <= keepRecentFlows) {
    return 0;
  }

  // Adjust: include any user message right before the cut point in the kept portion,
  // since a user message is a natural boundary for the kept context
  if (cutIndex > 0 && messages[cutIndex].role === "user") {
    return cutIndex;
  }

  // If the cut lands on an assistant, include it in the summarized portion
  // and find the next user boundary for the kept portion
  for (let i = cutIndex + 1; i < messages.length; i++) {
    if (messages[i].role === "user") {
      return i;
    }
  }

  return cutIndex;
}

// ============================================================================
// File Operation Tracking
// ============================================================================

/**
 * Tracked file operations from tool calls.
 * Used to append an accurate file list to the compaction summary,
 * so the LLM doesn't have to rely on memory to list which files were involved.
 *
 * To add new tools, update READ_TOOLS or WRITE_TOOLS below.
 * For tools with non-standard arg field names (e.g., copy_file uses sourcePath/targetPath
 * instead of path), add special handling in extractFileOpsFromMessages().
 */
interface FileOps {
  /** Files that were read (read_file, list_file, tree, glob, grep, etc.) */
  readFiles: Set<string>;
  /** Files that were created or modified (write_file, edit_file, search_replace, copy_file, move_file, delete_file, etc.) */
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
  const { keepRecentFlows = 4 } = config;
  const estimated = estimateTokens(messages);
  const tokensBefore = options?.actualTokens ?? estimated;

  // Find cut point: keep recent N assistant-tool flows, summarize the rest
  const cutIndex = findCutPoint(messages, keepRecentFlows);

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

  const summaryMessages = messages.slice(0, cutIndex);
  const keptMessages = messages.slice(cutIndex);

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
