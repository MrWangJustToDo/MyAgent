import { Box, Text } from "ink";

import { useAutocomplete } from "../hooks/use-autocomplete.js";

const MAX_VISIBLE = 10;

export const AutocompleteList = () => {
  const visible = useAutocomplete((s) => s.visible);
  const suggestions = useAutocomplete((s) => s.suggestions);
  const selectedIndex = useAutocomplete((s) => s.selectedIndex);

  if (!visible || suggestions.length === 0) return null;

  // Calculate visible window around selected index
  let startIndex = 0;
  if (suggestions.length > MAX_VISIBLE) {
    // Keep selected item visible with some context
    startIndex = Math.max(0, Math.min(selectedIndex - 2, suggestions.length - MAX_VISIBLE));
  }
  const endIndex = Math.min(startIndex + MAX_VISIBLE, suggestions.length);
  const visibleSuggestions = suggestions.slice(startIndex, endIndex);

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = endIndex < suggestions.length;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {hasMoreAbove && (
        <Text color="gray" dimColor>
          ↑ more above
        </Text>
      )}
      {visibleSuggestions.map((suggestion, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        return (
          <Box key={`${suggestion.label}-${i}`} gap={2}>
            <Text color={isSelected ? "yellow" : "gray"} bold={isSelected}>
              {isSelected ? "→" : " "} {suggestion.usage}
            </Text>
            {isSelected && suggestion.description && <Text color="gray">{suggestion.description}</Text>}
          </Box>
        );
      })}
      {hasMoreBelow && (
        <Text color="gray" dimColor>
          ↓ more below
        </Text>
      )}
      <Box height={1} flexGrow={1} flexShrink={0} />
    </Box>
  );
};
