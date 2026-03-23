import { generateId, generateShortId } from "../../base/utils.js";

import {
  DEFAULT_MAX_TODOS,
  DEFAULT_NAG_REMINDER_THRESHOLD,
  STATUS_ICONS,
  type TodoItem,
  type TodoItemInput,
  type TodoManagerConfig,
  type TodoStatus,
} from "./types.js";

// ============================================================================
// TodoManager ID Generator
// ============================================================================

export const generateTodoManagerId = (): string => generateId("todo");

// ============================================================================
// TodoManager Class
// ============================================================================

/**
 * TodoManager manages a list of todo items for an agent session.
 *
 * Key features:
 * - Maximum 20 todos allowed (configurable)
 * - Only ONE task can be in_progress at a time (enforces sequential focus)
 * - Tracks rounds since last todo update for nag reminder
 * - Event subscription for UI updates
 *
 * @example
 * ```typescript
 * const todoManager = new TodoManager();
 *
 * // Update todos (from tool call)
 * todoManager.update(
 *   [
 *   { content: "Read the file", status: "completed", priority: "high" },
 *   { content: "Edit the function", status: "in_progress", priority: "high" },
 *   { content: "Run tests", status: "pending", priority: "medium" },
 *   ],
 *   "Refactor auth module"
 * );
 *
 * // Render for display
 * console.log(todoManager.render());
 * // [✓] Read the file
 * // [>] Edit the function
 * // [ ] Run tests
 * // (1/3 completed)
 *
 * // Check if nag reminder needed
 * if (todoManager.shouldNag()) {
 *   // Inject reminder into messages
 * }
 * ```
 */
export class TodoManager {
  readonly id: string;
  readonly symbol = Symbol.for("todo-manager");

  /** Todo items */
  private items: TodoItem[] = [];

  /** Current todo set title */
  private title: string | null = null;

  /** Configuration */
  private maxTodos: number;
  private nagReminderThreshold: number;

  /** Rounds since last todo update */
  private roundsSinceUpdate = 0;

  /** Event listeners */
  private changeListeners: Set<(items: TodoItem[]) => void> = new Set();

  /** Auto-clear timer (when all todos completed) */
  private autoClearTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;

  constructor(config: TodoManagerConfig = {}) {
    this.id = generateTodoManagerId();
    this.maxTodos = config.maxTodos ?? DEFAULT_MAX_TODOS;
    this.nagReminderThreshold = config.nagReminderThreshold ?? DEFAULT_NAG_REMINDER_THRESHOLD;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Update the todo list (replaces all items).
   * This is the main method called by the todo tool.
   *
   * @throws Error if validation fails (max todos, multiple in_progress)
   */
  update(inputs: TodoItemInput[], title: string): string {
    // Validate max todos
    if (inputs.length > this.maxTodos) {
      throw new Error(`Maximum ${this.maxTodos} todos allowed, got ${inputs.length}`);
    }

    // Validate only one in_progress
    const inProgressCount = inputs.filter((item) => item.status === "in_progress").length;
    if (inProgressCount > 1) {
      throw new Error(`Only one task can be in_progress at a time, got ${inProgressCount}`);
    }

    // Validate no empty content
    for (let i = 0; i < inputs.length; i++) {
      if (!inputs[i].content.trim()) {
        throw new Error(`Todo item ${i + 1}: content cannot be empty`);
      }
    }

    const now = Date.now();
    this.title = title.trim();

    // Convert inputs to TodoItems
    this.items = inputs.map((input) => {
      // Try to find existing item with same content to preserve id
      const existing = this.items.find((item) => item.content === input.content);

      return {
        id: existing?.id ?? generateShortId(),
        content: input.content.trim(),
        status: input.status,
        priority: input.priority,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });

    // Reset rounds counter
    this.roundsSinceUpdate = 0;

    this.touch();
    this.notifyListeners();
    this.scheduleAutoClearIfNeeded();

    return this.render();
  }

  /**
   * Render the todo list as a formatted string.
   */
  render(): string {
    if (this.items.length === 0) {
      return "No todos.";
    }

    const lines: string[] = [];

    if (this.title) {
      lines.push(`Title: ${this.title}`);
      lines.push("");
    }

    for (const item of this.items) {
      const icon = STATUS_ICONS[item.status];
      const priorityTag = item.priority === "high" ? " [HIGH]" : item.priority === "low" ? " [low]" : "";
      lines.push(`${icon} ${item.content}${priorityTag}`);
    }

    const completed = this.items.filter((item) => item.status === "completed").length;
    lines.push("");
    lines.push(`(${completed}/${this.items.length} completed)`);

    return lines.join("\n");
  }

  // ============================================================================
  // Round Tracking & Nag Reminder
  // ============================================================================

  /**
   * Increment the round counter. Call this after each agent step.
   */
  incrementRound(): void {
    this.roundsSinceUpdate++;
  }

  /**
   * Check if a nag reminder should be injected.
   * Returns true if:
   * - There are todos
   * - Rounds since update >= threshold
   * - There are incomplete todos
   */
  shouldNag(): boolean {
    if (this.items.length === 0) return false;
    if (this.roundsSinceUpdate < this.nagReminderThreshold) return false;

    // Only nag if there are incomplete todos
    const hasIncomplete = this.items.some((item) => item.status !== "completed");
    return hasIncomplete;
  }

  /**
   * Get the nag reminder message to inject.
   */
  getNagReminder(): string {
    return "<reminder>Update your todos - mark completed tasks and update progress.</reminder>";
  }

  /**
   * Reset the round counter (called when todo tool is used).
   */
  resetRoundCounter(): void {
    this.roundsSinceUpdate = 0;
  }

  /**
   * Get current rounds since last update.
   */
  getRoundsSinceUpdate(): number {
    return this.roundsSinceUpdate;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Get all todo items.
   */
  getItems(): TodoItem[] {
    return [...this.items];
  }

  /**
   * Get the current todo set title.
   */
  getTitle(): string | null {
    return this.title;
  }

  /**
   * Get items by status.
   */
  getItemsByStatus(status: TodoStatus): TodoItem[] {
    return this.items.filter((item) => item.status === status);
  }

  /**
   * Get the current in_progress item (if any).
   */
  getCurrentTask(): TodoItem | null {
    return this.items.find((item) => item.status === "in_progress") ?? null;
  }

  /**
   * Get completion stats.
   */
  getStats(): { total: number; completed: number; inProgress: number; pending: number } {
    return {
      total: this.items.length,
      completed: this.items.filter((item) => item.status === "completed").length,
      inProgress: this.items.filter((item) => item.status === "in_progress").length,
      pending: this.items.filter((item) => item.status === "pending").length,
    };
  }

  /**
   * Check if all todos are completed.
   */
  isAllCompleted(): boolean {
    return this.items.length > 0 && this.items.every((item) => item.status === "completed");
  }

  /**
   * Check if there are any todos.
   */
  hasTodos(): boolean {
    return this.items.length > 0;
  }

  /**
   * Check if there are incomplete todos (pending or in_progress).
   * Useful for determining if context compaction should be blocked.
   */
  hasIncompleteTodos(): boolean {
    return this.items.some((item) => item.status === "pending" || item.status === "in_progress");
  }

  /**
   * Get incomplete todos for inclusion in compaction summary.
   * Returns pending and in_progress items.
   */
  getIncompleteTodos(): TodoItem[] {
    return this.items.filter((item) => item.status === "pending" || item.status === "in_progress");
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  /**
   * Subscribe to todo changes.
   */
  onChange(listener: (items: TodoItem[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifyListeners(): void {
    const items = this.getItems();
    for (const listener of this.changeListeners) {
      try {
        listener(items);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Clear all todos.
   */
  clear(): void {
    this.items = [];
    this.roundsSinceUpdate = 0;
    this.title = null;
    this.clearAutoClearTimer();
    this.touch();
    this.notifyListeners();
  }

  /**
   * Reset everything.
   */
  reset(): void {
    this.clear();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private scheduleAutoClearIfNeeded(): void {
    this.clearAutoClearTimer();

    if (!this.isAllCompleted()) {
      return;
    }

    this.autoClearTimeoutId = setTimeout(() => {
      if (this.isAllCompleted()) {
        this.clear();
      }
    }, 3_000);
  }

  private clearAutoClearTimer(): void {
    if (this.autoClearTimeoutId) {
      clearTimeout(this.autoClearTimeoutId);
      this.autoClearTimeoutId = null;
    }
  }
}
