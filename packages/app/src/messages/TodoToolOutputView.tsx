import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";

import type { TodoItem, TodoPriority, TodoStatus } from "@my-agent/core";

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

/** Fallback for older tool parts that only stored title. */
const PLAN_TODO_TITLE = "Plan";

// ============================================================================
// Types
// ============================================================================

export interface TodoToolOutputViewProps {
  items: TodoItem[];
  /** Explicit marker from todo tool output (`source=plan`). */
  source?: "plan" | "agent" | null;
  /** Fallback when `source` is missing (pre-marker transcripts). */
  title?: string | null;
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

function isPlanTodoSource(source?: string | null, title?: string | null): boolean {
  if (source === "plan") return true;
  if (source === "agent") return false;
  return title === PLAN_TODO_TITLE;
}

/**
 * Rich todo list renderer for the `todo` tool output.
 *
 * Plan-sourced lists (`source=plan`, or legacy title `"Plan"`) get step numbers.
 */
export const TodoToolOutputView = ({ items, source, title }: TodoToolOutputViewProps) => {
  if (items.length === 0) return null;

  const showStep = isPlanTodoSource(source, title);
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
