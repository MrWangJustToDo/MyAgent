/**
 * Compact Tool - Conversation compression via summary + split pointer.
 *
 * When called:
 * 1. Summarizes the current LLM-visible messages via a subagent
 * 2. Sets the summary as the new summaryMessage on the context
 * 3. Advances compactIndex so future LLM calls only see summary + new messages
 */

import { tool } from "ai";
import { z } from "zod";

import { autoCompact, createCompactedMessages } from "../compaction/auto-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";

import { withDuration } from "./helpers.js";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { CompactionConfig } from "../compaction/types.js";
import type { Agent } from "../loop/Agent.js";
import type { TodoManager } from "../todo-manager";
import type { ModelMessage } from "ai";

// ============================================================================
// Types
// ============================================================================

export interface CompactToolConfig {
  /** Function to get current LLM-visible messages */
  getMessages: () => ModelMessage[];
  /** The agent context (for updating summaryMessage and compactIndex) */
  context: AgentContext;
  /** The agent instance (used for ID) */
  agent: Agent;
  /** Sandbox for subagent execution */
  sandbox: Sandbox;
  /** Compaction configuration */
  config?: Partial<CompactionConfig>;
  /** Optional TodoManager to check for incomplete todos */
  todoManager?: TodoManager | null;
  /** Callback after compaction completes (e.g. reset compact hint flag) */
  onCompact?: () => void;
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
  context,
  agent,
  sandbox,
  config = {},
  todoManager,
  onCompact,
}: CompactToolConfig) => {
  return tool({
    description: `Compact the conversation to reduce context size.

Use this tool when:
- The system tells you the context is getting large
- The conversation is getting long and you want to preserve context
- You're about to start a significantly different task

What happens:
1. A subagent summarizes the key information from the conversation
2. Incomplete todos are included in the summary so you can restore them
3. A compaction summary is created — future LLM calls only see the summary + new messages

The summary focuses on: what was done, current work, files modified, next steps, user preferences, technical decisions, and active todos.

IMPORTANT: After compaction, read the summary carefully and use the todo tool to re-create any incomplete tasks that were preserved.`,

    inputSchema: z.object({
      focus: z
        .string()
        .optional()
        .describe(
          "Optional focus area for the summary. E.g., 'preserve the API design decisions' or 'focus on the error handling approach'"
        ),
    }),

    outputSchema: compactOutputSchema,

    execute: async ({ focus }) => {
      return withDuration(async () => {
        const messages = getMessages();

        if (messages.length === 0) {
          return {
            success: false,
            tokensBefore: 0,
            tokensAfter: 0,
            summary: "",
            compressionRatio: "0%",
            message: "No messages to compact.",
          };
        }

        const incompleteTodos = todoManager?.getIncompleteTodos() ?? [];
        const todos = incompleteTodos.map((t) => ({
          content: t.content,
          status: t.status as "pending" | "in_progress" | "completed",
          priority: t.priority as "high" | "medium" | "low",
        }));

        const tokensBefore = estimateTokens(messages);

        const actualTokens = agent.context?.getUsage().inputTokens ?? 0;

        const result = await autoCompact(messages, config, agent.id, sandbox, { focus, todos, actualTokens });

        if (result.compacted && result.summary && result.cutIndex != null) {
          const summaryMsg = createCompactedMessages(result.summary)[0];
          context.setSummaryMessage(summaryMsg);
          // cutIndex is relative to LLM-visible messages; translate to absolute index
          const absoluteCut = context.getCompactIndex() + result.cutIndex;
          context.setCompactIndex(absoluteCut);
          context.resetUsage();
          onCompact?.();
        }

        const compressionRatio = tokensBefore > 0 ? Math.round((1 - result.tokensAfter / tokensBefore) * 100) : 0;

        const todoNote =
          incompleteTodos.length > 0
            ? ` ${incompleteTodos.length} incomplete todo(s) included in summary - restore them with the todo tool.`
            : "";

        return {
          success: result.compacted,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          summary: result.summary || "",
          compressionRatio: `${compressionRatio}%`,
          message: result.compacted
            ? `Compacted conversation from ~${tokensBefore} to ~${result.tokensAfter} tokens (${compressionRatio}% reduction).${todoNote}`
            : result.error || "Nothing to compact.",
        };
      });
    },
  });
};
