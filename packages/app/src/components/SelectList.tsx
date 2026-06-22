import { Box, Text } from "ink";

import { useSelect } from "../hooks/use-select.js";

export const SelectList = () => {
  const { visible, options, selectedIndex, selectedSet, multiSelect } = useSelect((s) => ({
    visible: s.visible,
    options: s.options,
    selectedIndex: s.selectedIndex,
    selectedSet: s.selectedSet,
    multiSelect: s.multiSelect,
  }));

  if (!visible || options.length === 0) return null;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {options.map((opt, i) => {
        const isCursor = i === selectedIndex;
        const isChecked = selectedSet.includes(i);
        const cursor = isCursor ? ">" : " ";

        let prefix = "";
        if (multiSelect) {
          prefix = isChecked ? " [x] " : " [ ] ";
        } else {
          prefix = " ";
        }

        return (
          <Box key={`${opt.value}-${i}`}>
            <Text color={isCursor ? "cyan" : "gray"} bold={isCursor}>
              {cursor}
              {prefix}
              {opt.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
