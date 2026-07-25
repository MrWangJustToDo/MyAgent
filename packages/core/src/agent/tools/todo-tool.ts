import { PLAN_TODO_TITLE } from "../plan/plan-mode-controller.js";
import { todoToolInputSchema } from "../todo-manager/types.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { todoOutputSchema } from "./util/types.js";

import type { TodoManager } from "../todo-manager";
import type { TodoOutput } from "./util/types.js";

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
 - While building an approved plan, keep title "${PLAN_TODO_TITLE}" so progress stays linked to the plan
 - Only ONE task can be in_progress at a time
 - Update todos frequently - mark tasks complete immediately when done
 - Each call REPLACES all todos, so include the full updated list
 - Maximum 20 todos allowed`,
    inputSchema: todoToolInputSchema,
    outputSchema: todoOutputSchema,
    execute: async ({ todos, title }) => {
      return withDuration(async () => {
        todoManager.update(todos, title);
        // Keep plan binding when the model updates under the plan title during building.
        if (title.trim() === PLAN_TODO_TITLE) {
          todoManager.setPlanBound(true);
        }
        const stats = todoManager.getStats();
        const items = todoManager.getItems();
        const source = todoManager.getSource();

        return {
          title,
          source,
          items,
          stats,
        };
      });
    },
    // Send title + source + items so the model keeps plan linkage across turns.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: TodoOutput }) {
      const lines = output.items?.map?.((item) => {
        const icon = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]";
        return `${icon} ${item.content}`;
      });
      const sourceTag = output.source === "plan" ? " [source=plan]" : "";
      return [{ type: "text" as const, content: `${output.title}${sourceTag}\n${lines?.join("\n")}` }];
    },
  });
};
