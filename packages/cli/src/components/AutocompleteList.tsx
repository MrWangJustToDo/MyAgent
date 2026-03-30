import { Box, Text } from "ink";

import { useAutocomplete } from "../hooks/use-autocomplete.js";

export const AutocompleteList = () => {
  const visible = useAutocomplete((s) => s.visible);
  const suggestions = useAutocomplete((s) => s.suggestions);
  const selectedIndex = useAutocomplete((s) => s.selectedIndex);

  if (!visible || suggestions.length === 0) return null;

  return (
    <Box flexDirection="column">
      {suggestions.map((cmd, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={cmd.name} gap={1}>
            <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
              {isSelected ? ">" : " "} /{cmd.name}
            </Text>
            <Text color="gray" dimColor={!isSelected}>
              {cmd.description}
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor>
        Tab to accept, Esc to dismiss
      </Text>
    </Box>
  );
};
