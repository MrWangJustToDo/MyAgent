import { todoToolInputSchema } from "../todo-manager/types.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { todoOutputSchema } from "./util/types.js";

import type { TodoManager } from "../todo-manager";

export const createTodoTool = ({ todoManager }: { todoManager: TodoManager }) => {
  return defineServerTool({
    name: "todo",
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
  });
};
