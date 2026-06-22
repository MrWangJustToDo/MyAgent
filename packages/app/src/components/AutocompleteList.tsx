import { Box, Text } from "ink";
import { useMemo } from "react";

import { useAutocomplete } from "../hooks/use-autocomplete.js";

const MAX_VISIBLE = 10;

export const AutocompleteList = () => {
  const visible = useAutocomplete((s) => s.visible);
  const suggestions = useAutocomplete((s) => s.suggestions);
  const selectedIndex = useAutocomplete((s) => s.selectedIndex);

  const { startIndex, endIndex, visibleSuggestions, maxLabelWidth } = useMemo(() => {
    if (!visible || suggestions.length === 0) {
      return { startIndex: 0, endIndex: 0, visibleSuggestions: [], maxLabelWidth: 0 };
    }
    let start = 0;
    if (suggestions.length > MAX_VISIBLE) {
      start = Math.max(0, Math.min(selectedIndex - 2, suggestions.length - MAX_VISIBLE));
    }
    const end = Math.min(start + MAX_VISIBLE, suggestions.length);
    const items = suggestions.slice(start, end);
    const labelWidth = Math.max(...items.map((s) => s.label.length), 8);
    return { startIndex: start, endIndex: end, visibleSuggestions: items, maxLabelWidth: labelWidth };
  }, [visible, suggestions, selectedIndex]);

  if (!visible || suggestions.length === 0) return null;

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = endIndex < suggestions.length;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {hasMoreAbove && (
        <Text color="gray" dimColor>
          ▲
        </Text>
      )}
      {visibleSuggestions.map((suggestion, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        const label = suggestion.label.padEnd(maxLabelWidth + 2);

        return (
          <Box key={`${suggestion.label}-${i}`} flexDirection="row">
            <Box width="30%" flexShrink={0} flexGrow={0}>
              <Text
                backgroundColor={isSelected ? "green" : undefined}
                color={isSelected ? "black" : "cyan"}
                bold={isSelected}
                wrap="truncate"
              >
                {label}
              </Text>
            </Box>
            <Text color={isSelected ? "white" : "gray"} dimColor={!isSelected} wrap="truncate">
              {suggestion.description}
            </Text>
          </Box>
        );
      })}
      {hasMoreBelow && (
        <Text color="gray" dimColor>
          ▼
        </Text>
      )}
      {suggestions.length > MAX_VISIBLE && (
        <Text color="gray" dimColor>
          ({selectedIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
};
