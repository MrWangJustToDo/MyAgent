import { Box, Text } from "ink";

import type { ReactNode } from "react";

export function calcScrollOffset(focusIndex: number, total: number, maxVisible: number, padding = 2): number {
  if (total <= maxVisible) return 0;
  return Math.max(0, Math.min(focusIndex - padding, total - maxVisible));
}

interface ScrollableListProps<T> {
  items: T[];
  maxVisible: number;
  scrollOffset: number;
  renderItem: (item: T, index: number) => ReactNode;
  showCount?: boolean;
}

export function ScrollableList<T>({ items, maxVisible, scrollOffset, renderItem, showCount }: ScrollableListProps<T>) {
  if (items.length === 0) return null;

  const start = Math.max(0, Math.min(scrollOffset, items.length - maxVisible));
  const end = Math.min(start + maxVisible, items.length);
  const visibleItems = items.slice(start, end);

  const hasMoreAbove = start > 0;
  const hasMoreBelow = end < items.length;
  const countText =
    showCount && items.length > maxVisible
      ? `(${Math.min(scrollOffset + 1, items.length - maxVisible + 1)}/${items.length - maxVisible + 1})`
      : "";

  return (
    <>
      {/* Always render indicator lines to prevent layout shift on scroll */}
      <Text color="gray" dimColor>
        {hasMoreAbove ? `\u25b2 (${start} more)` : "\u2500"}
      </Text>
      {visibleItems.map((item, i) => (
        <Box key={start + i}>{renderItem(item, start + i)}</Box>
      ))}
      <Text color="gray" dimColor>
        {hasMoreBelow ? `\u25bc (${items.length - end} more)` : "\u2500"}
      </Text>
      {showCount && (
        <Text color="gray" dimColor>
          {countText}
        </Text>
      )}
    </>
  );
}
