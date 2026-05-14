import { Box, Text } from "ink";

import { useTodoManager } from "../hooks";

import { TodoList } from "./TodoList";

export const TodoStats = () => {
  const { items, stats } = useTodoManager((s) => ({ items: s.items, stats: s.stats }));

  if (items.length === 0) {
    return null;
  }

  const pendingCount = stats.pending;

  return (
    <Box gap={2} flexShrink={0}>
      <Text>|</Text>
      <Text color="cyan" bold>
        Tasks:
      </Text>
      <Text color="green">{stats.completed}</Text>
      <Text color="gray">/</Text>
      <Text>{stats.total}</Text>
      {pendingCount > 0 && (
        <Text color="gray" dimColor>
          ({pendingCount} pending)
        </Text>
      )}
      <TodoList />
    </Box>
  );
};
