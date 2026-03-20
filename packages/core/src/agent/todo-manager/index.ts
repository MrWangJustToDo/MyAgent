/**
 * TodoManager module - Task tracking for agent sessions
 *
 * This module provides the TodoManager class for tracking tasks during agent execution.
 * It helps the model stay focused on multi-step tasks by:
 * - Limiting to one in_progress task at a time
 * - Providing nag reminders when todos aren't updated
 * - Rendering progress for user visibility
 *
 * @example
 * ```typescript
 * import { TodoManager } from '@my-agent/core';
 *
 * const todoManager = new TodoManager();
 *
 * // Update from tool call
 * todoManager.update(
 *   [
 *     { content: "Analyze the codebase", status: "completed", priority: "high" },
 *     { content: "Implement the feature", status: "in_progress", priority: "high" },
 *     { content: "Write tests", status: "pending", priority: "medium" },
 *   ],
 *   "Feature rollout plan"
 * );
 *
 * // Check progress
 * console.log(todoManager.render());
 * console.log(todoManager.getStats()); // { total: 3, completed: 1, inProgress: 1, pending: 1 }
 *
 * // Track rounds for nag reminder
 * todoManager.incrementRound();
 * if (todoManager.shouldNag()) {
 *   // Inject reminder message
 * }
 * ```
 */

export { TodoManager, generateTodoManagerId } from "./todo-manager.js";
export {
  // Types
  type TodoItem,
  type TodoItemInput,
  type TodoStatus,
  type TodoPriority,
  type TodoManagerConfig,
  type TodoToolInput,
  // Schemas
  todoItemInputSchema,
  todoToolInputSchema,
  // Constants
  TODO_STATUSES,
  TODO_PRIORITIES,
  STATUS_ICONS,
  DEFAULT_MAX_TODOS,
  DEFAULT_NAG_REMINDER_THRESHOLD,
} from "./types.js";
