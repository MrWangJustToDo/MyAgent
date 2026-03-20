import { tool } from "ai";

import { todoToolInputSchema } from "../todo-manager/types.js";

import { withDuration } from "./helpers.js";
import { todoOutputSchema } from "./types.js";

import type { TodoManager } from "../todo-manager";

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
        // Update the todo manager
        const todoList = todoManager.update(todos, title);
        const stats = todoManager.getStats();

        return {
          success: true,
          title,
          todoList,
          stats,
          message: `Updated ${stats.total} todos: ${stats.completed} completed, ${stats.inProgress} in progress, ${stats.pending} pending`,
        };
      });
    },
  });
};
