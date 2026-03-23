/**
 * Compact Tool (Layer 3) - Manual conversation compression.
 *
 * This tool allows the agent to manually trigger context compaction.
 * It performs the same operation as auto_compact but on demand.
 *
 * When called:
 * 1. Saves full conversation transcript to disk
 * 2. Uses LLM to summarize the conversation
 * 3. Signals that messages should be replaced with the summary
 *
 * The actual message replacement happens at the agent level,
 * not within this tool (similar to how the task tool spawns subagents).
 *
 * @example
 * ```typescript
 * const compactTool = createCompactTool({
 *   getMessages: () => agent.getMessages(),
 *   getModel: () => agent.getModel(),
 *   sandbox,
 *   config: compactionConfig,
 *   onCompact: (result) => agent.replaceMessages(result.messages),
 * });
 * ```
 */

import { tool } from "ai";
import { z } from "zod";

import { autoCompact } from "../compaction/auto-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";

import { withDuration } from "./helpers.js";

import type { Sandbox } from "../../environment";
import type { CompactionConfig, CompactionResult } from "../compaction/types.js";
import type { TodoManager } from "../todo-manager";
import type { LanguageModel, ModelMessage } from "ai";

// ============================================================================
// Types
// ============================================================================

export interface CompactToolConfig {
  /** Function to get current messages */
  getMessages: () => ModelMessage[];
  /** Function to get the model for summarization */
  getModel: () => LanguageModel;
  /** Sandbox for filesystem access */
  sandbox: Sandbox;
  /** Compaction configuration */
  config?: Partial<CompactionConfig>;
  /** Optional TodoManager to check for incomplete todos */
  todoManager?: TodoManager | null;
  /**
   * Callback when compaction is complete.
   * The agent should use this to replace messages with the compressed version.
   */
  onCompact?: (result: CompactionResult & { messages: ModelMessage[] }) => void | Promise<void>;
}

// ============================================================================
// Output Schema
// ============================================================================

export const compactOutputSchema = z.object({
  /** Whether compaction was performed */
  success: z.boolean().describe("Whether compaction was successful"),
  /** Estimated tokens before compaction */
  tokensBefore: z.number().describe("Estimated tokens before compaction"),
  /** Estimated tokens after compaction */
  tokensAfter: z.number().describe("Estimated tokens after compaction"),
  /** Path to the saved transcript file */
  transcriptPath: z.string().describe("Path to the saved transcript file"),
  /** Summary that was generated */
  summary: z.string().describe("The generated conversation summary"),
  /** Compression ratio achieved */
  compressionRatio: z.string().describe("Percentage of tokens reduced"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
  /** Message to display */
  message: z.string().describe("Human-readable result message"),
});

export type CompactOutput = z.infer<typeof compactOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates the compact tool for manual conversation compression.
 *
 * @param config - Tool configuration
 * @returns Vercel AI SDK tool
 */
export const createCompactTool = ({
  getMessages,
  getModel,
  sandbox,
  config = {},
  todoManager,
  onCompact,
}: CompactToolConfig) => {
  return tool({
    description: `Manually compact the conversation to reduce context size.

Use this tool when:
- The conversation is getting long and you want to preserve context
- You're about to start a significantly different task
- You want to ensure important context is summarized before it's lost

IMPORTANT: This tool will be BLOCKED if there are incomplete todos (pending or in_progress tasks).
Complete all todos first before compacting to preserve task context.

What happens:
1. Full conversation is saved to a transcript file (preserves everything)
2. LLM summarizes the key information from the conversation
3. Messages are replaced with the summary to reduce token usage

The summary focuses on: what was done, current work, files modified, next steps, user preferences, and technical decisions.`,

    inputSchema: z.object({
      focus: z
        .string()
        .optional()
        .describe(
          "Optional focus area for the summary. E.g., 'preserve the API design decisions' or 'focus on the error handling approach'"
        ),
      force: z
        .boolean()
        .optional()
        .describe("Force compaction even if there are incomplete todos. Use with caution - may lose task context."),
    }),

    outputSchema: compactOutputSchema,

    execute: async ({ focus, force }) => {
      return withDuration(async () => {
        const messages = getMessages();
        const model = getModel();

        // Check if there's anything to compact
        if (messages.length === 0) {
          return {
            success: false,
            tokensBefore: 0,
            tokensAfter: 0,
            transcriptPath: "",
            summary: "",
            compressionRatio: "0%",
            message: "No messages to compact.",
          };
        }

        // Check for incomplete todos (unless force is set)
        if (!force && todoManager?.hasIncompleteTodos()) {
          const incompleteTodos = todoManager.getIncompleteTodos();
          const todoList = incompleteTodos.map((t) => `- [${t.status}] ${t.content}`).join("\n");
          return {
            success: false,
            tokensBefore: estimateTokens(messages),
            tokensAfter: estimateTokens(messages),
            transcriptPath: "",
            summary: "",
            compressionRatio: "0%",
            message: `Cannot compact: ${incompleteTodos.length} incomplete todo(s) exist. Complete them first to preserve task context.\n\nIncomplete todos:\n${todoList}\n\nUse force=true to compact anyway (not recommended).`,
          };
        }

        const tokensBefore = estimateTokens(messages);

        // Perform compaction
        const result = await autoCompact(messages, config, model, sandbox, focus);

        // Notify the agent to replace messages
        if (onCompact) {
          await onCompact(result);
        }

        const compressionRatio = tokensBefore > 0 ? Math.round((1 - result.tokensAfter / tokensBefore) * 100) : 0;

        return {
          success: true,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          transcriptPath: result.transcriptPath || "",
          summary: result.summary || "",
          compressionRatio: `${compressionRatio}%`,
          message: `Compacted conversation from ~${tokensBefore} to ~${result.tokensAfter} tokens (${compressionRatio}% reduction). Transcript saved to ${result.transcriptPath}`,
        };
      });
    },
  });
};
