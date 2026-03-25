/**
 * Task Tool - Spawns a subagent for delegated tasks.
 *
 * The task tool allows the parent agent to delegate exploration or research
 * tasks to a subagent with fresh context. The subagent runs with read-only
 * tools and returns only a summary to the parent.
 *
 * This keeps the parent's context clean - only the summary is added,
 * not all the intermediate tool calls the subagent made.
 *
 * @example
 * ```typescript
 * const taskTool = createTaskTool({ parentAgentId: agent.id, agentManager: manager });
 *
 * // Agent can now use the task tool:
 * // "Use the task tool to find what testing framework this project uses"
 * ```
 */

import { tool } from "ai";
import { z } from "zod";

import { generateId } from "../../base/utils.js";
import { runSubagent } from "../subagent/subagent.js";

import { withDuration } from "./helpers.js";

// ============================================================================
// Types
// ============================================================================

export interface TaskToolConfig {
  /** Parent agent ID to spawn subagent from */
  parentAgentId: string;
}

// ============================================================================
// Output Schema
// ============================================================================

export const taskOutputSchema = z.object({
  /** Subagent ID - can be used to track or access the subagent */
  subagentId: z.string().describe("ID of the subagent that executed this task"),
  /** Summary of what the subagent found/accomplished */
  summary: z.string().describe("Summary of the subagent's findings"),
  /** Whether the summary was truncated due to length */
  truncated: z.boolean().describe("Whether the summary was truncated"),
  /** Number of iterations the subagent used */
  iterations: z.number().describe("Number of iterations used"),
  /** Whether the subagent hit the iteration limit */
  reachedLimit: z.boolean().describe("Whether iteration limit was reached"),
  /** Token usage */
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
    })
    .describe("Token usage for this subtask"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
});

export type TaskOutput = z.infer<typeof taskOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates the task tool for delegating work to subagents.
 *
 * The task tool:
 * 1. Spawns a subagent with fresh context (empty messages)
 * 2. Subagent uses read-only tools to complete the task
 * 3. Only the final summary is returned to the parent
 * 4. Subagent's full message history is discarded
 *
 * @param config - Tool configuration with parent agent ID and manager
 * @returns Vercel AI SDK tool
 */
export const createTaskTool = ({ parentAgentId }: TaskToolConfig) => {
  return tool({
    description: `Spawn a subagent with fresh context to complete a delegated task.

Use this tool when you need to:
- Explore the codebase to find specific information
- Research a question that requires reading multiple files
- Perform complex multi-step exploration without polluting your context

The subagent:
- Starts with fresh context (doesn't see your conversation history)
- Has read-only tools (read_file, glob, grep, run_command, list_file, tree)
- Cannot modify files or spawn additional subagents
- Returns only a summary of its findings

Example use cases:
- "Find what testing framework this project uses"
- "List all API endpoints in the codebase"
- "Search for how error handling is implemented"
- "Explore the authentication module structure"`,

    inputSchema: z.object({
      id: z
        .string()
        .default(() => generateId("subagent"))
        .describe("Unique ID for this subagent task. Auto-generated if not provided."),
      prompt: z.string().describe("The task for the subagent to complete. Be specific about what you want to know."),
      description: z
        .string()
        .optional()
        .describe("Short description of the task (shown in UI). Defaults to 'subtask'."),
    }),

    outputSchema: taskOutputSchema,

    execute: async ({ id, prompt, description }, { abortSignal }) => {
      return withDuration(async () => {
        const result = await runSubagent({
          subagentId: id,
          prompt,
          description,
          parentAgentId,
          abortSignal,
          // Auto-destroy since task tool manages the lifecycle
          autoDestroy: false,
        });

        return {
          subagentId: result.subagentId,
          summary: result.output,
          truncated: result.truncated,
          iterations: result.iterations,
          reachedLimit: result.reachedLimit,
          retries: result.retries,
          usage: result.usage,
        };
      });
    },
  });
};
