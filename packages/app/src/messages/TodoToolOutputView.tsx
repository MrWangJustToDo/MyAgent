import { Box, Text } from "ink";

import type { TodoItem, TodoPriority, TodoStatus } from "@my-agent/core";

// ============================================================================
// Visual constants — kept in sync with components/TodoList.tsx
// ============================================================================

const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: "gray",
  in_progress: "yellow",
  completed: "green",
};

const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[✓]",
};

const PRIORITY_LABELS: Record<TodoPriority, string | null> = {
  high: "HIGH",
  medium: null,
  low: "low",
};

// ============================================================================
// Types
// ============================================================================

export interface TodoToolOutputViewProps {
  items: TodoItem[];
}

// ============================================================================
// Sub-components
// ============================================================================

const TodoRow = ({ item }: { item: TodoItem }) => {
  const icon = STATUS_ICONS[item.status];
  const color = STATUS_COLORS[item.status];
  const priorityLabel = PRIORITY_LABELS[item.priority];

  return (
    <Box flexDirection="row" gap={1}>
      <Box flexShrink={0}>
        <Text color={color}>{icon}</Text>
      </Box>
      <Text color={color} wrap="wrap">
        {item.content}
      </Text>
      {priorityLabel && (
        <Box flexShrink={0}>
          <Text color={item.priority === "high" ? "red" : "gray"} dimColor>
            [{priorityLabel}]
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ============================================================================
// Main component
// ============================================================================

/**
 * Rich todo list renderer for the `todo` tool output.
 *
 * Shows every todo item with status-colored icons. The title and progress
 * summary (e.g. "2/5 done") are already shown in the tool header, so they
 * are not repeated here.
 */
export const TodoToolOutputView = ({ items }: TodoToolOutputViewProps) => {
  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" paddingLeft={2} gap={0}>
      {items.map((item) => (
        <TodoRow key={item.id} item={item} />
      ))}
    </Box>
  );
};
