import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";

import type { TodoItem, TodoPriority, TodoStatus } from "@codent/core";

// ============================================================================
// Visual constants — kept in sync with components/TodoList.tsx
// ============================================================================

const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: COLORS.muted,
  in_progress: COLORS.warning,
  completed: COLORS.success,
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
  /** Explicit marker from todo tool output (`source=plan`). */
  source?: "plan" | "agent" | null;
}

// ============================================================================
// Sub-components
// ============================================================================

const TodoRow = ({ item, stepIndex, showStep }: { item: TodoItem; stepIndex: number; showStep: boolean }) => {
  const icon = STATUS_ICONS[item.status];
  const color = STATUS_COLORS[item.status];
  const priorityLabel = PRIORITY_LABELS[item.priority];

  return (
    <Box flexDirection="row" gap={1}>
      <Box flexShrink={0}>
        <Text color={color}>{icon}</Text>
      </Box>
      {showStep && (
        <Box flexShrink={0}>
          <Text color={COLORS.muted} dimColor>
            {stepIndex}.
          </Text>
        </Box>
      )}
      <Text color={color} wrap="wrap">
        {item.content}
      </Text>
      {priorityLabel && (
        <Box flexShrink={0}>
          <Text color={item.priority === "high" ? COLORS.danger : COLORS.muted} dimColor>
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

function isPlanTodoSource(source?: string | null): boolean {
  // Ownership is the `source` marker only. Older transcripts predate the marker, but
  // falling back to the title made any agent list named "Plan" render as plan steps —
  // and a persisted `todoPlanBound` then kept that rendering for every later list.
  return source === "plan";
}

/**
 * Rich todo list renderer for the `todo` tool output.
 *
 * Plan-sourced lists (`source=plan`) get step numbers.
 */
export const TodoToolOutputView = ({ items, source }: TodoToolOutputViewProps) => {
  if (items.length === 0) return null;

  const showStep = isPlanTodoSource(source);
  const completed = items.filter((i) => i.status === "completed").length;

  return (
    <Box flexDirection="column" paddingLeft={2} gap={0}>
      {showStep && (
        <Text color={COLORS.muted} dimColor>
          Plan steps · {completed}/{items.length}
        </Text>
      )}
      {items.map((item, index) => (
        <TodoRow key={item.id} item={item} stepIndex={index + 1} showStep={showStep} />
      ))}
    </Box>
  );
};
