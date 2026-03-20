import { Box, Text } from "ink";

import { useTodoManager } from "../hooks/use-todo-manager.js";

import type { TodoItem, TodoStatus } from "@my-agent/core";

// Status colors for terminal
const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: "gray",
  in_progress: "yellow",
  completed: "green",
};

// Status icons for terminal
const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[x]",
};

/**
 * Compact todo item display for a single line
 */
const TodoItemView = ({ item }: { item: TodoItem }) => {
  const icon = STATUS_ICONS[item.status];
  const color = STATUS_COLORS[item.status];

  return (
    <Text color={color}>
      {icon} {item.content}
    </Text>
  );
};

/**
 * TodoList component for displaying todos in the footer.
 *
 * Shows a compact summary when there are todos, or nothing when empty.
 */
export const TodoList = () => {
  const items = useTodoManager((s) => s.items);

  // Don't render anything if no todos
  if (items.length === 0) {
    return null;
  }

  // Find current in_progress task
  const currentTask = items.find((item) => item.status === "in_progress");

  if (currentTask) {
    return (
      <Box>
        <TodoItemView item={currentTask} />
      </Box>
    );
  }

  return null;
};
