import { tool } from "ai";

import { todoToolInputSchema } from "../todo-manager/types.js";

import { withDuration } from "./util/helpers.js";
import { todoOutputSchema } from "./util/types.js";

import type { TodoManager } from "../todo-manager";
import type { TodoOutput } from "./util/types.js";

/**
 * Creates a todo tool using Vercel AI SDK.
 *
 * This tool allows the AI to manage a task list for tracking progress
 * on multi-step tasks. It helps the model stay focused and provides
 * visibility into current work.
 *
 * Key constraints:
 * - Maximum 20 todos allowed
 * - Only ONE task can be in_progress at a time (enforces sequential focus)
 * - All todos are replaced on each update (not incremental)
 *
 * @example
 * ```typescript
 * const todoManager = new TodoManager();
 * const todoTool = createTodoTool({ todoManager });
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model,
 *   tools: { todo: todoTool },
 *   prompt: "Create a plan to refactor the auth module",
 * });
 * ```
 */
export const createTodoTool = ({ todoManager }: { todoManager: TodoManager }) => {
  return tool({
    description: `Create and manage a task list to track progress on multi-step work. Use this tool to:
 - Plan complex tasks by breaking them into steps
 - Track what you're currently working on (mark as in_progress)
 - Mark tasks as completed when done
 - Keep the user informed of your progress

IMPORTANT RULES:
 - Always include a short title for the current todo set
 - Only ONE task can be in_progress at a time
 - Update todos frequently - mark tasks complete immediately when done
 - Each call REPLACES all todos, so include the full updated list
 - Maximum 20 todos allowed`,
    inputSchema: todoToolInputSchema,
    outputSchema: todoOutputSchema,
    execute: async ({ todos, title }) => {
      return withDuration(async () => {
        // Update the todo manager (return value is a rendered string, no longer needed
        // — the LLM consumes the structured `items` array instead).
        todoManager.update(todos, title);
        const stats = todoManager.getStats();
        const items = todoManager.getItems();

        return {
          title,
          items,
          stats,
        };
      });
    },

    // Only send items to the LLM — it needs the todo list to plan. title is
    // echoed in the input, stats can be derived from items, durationMs is metadata.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: TodoOutput }) {
      const lines = output.items.map((item) => {
        const icon = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]";
        return `${icon} ${item.content}`;
      });
      return {
        type: "content" as const,
        value: [{ type: "text" as const, text: `${output.title}\n${lines.join("\n")}` }],
      };
    },
  });
};
