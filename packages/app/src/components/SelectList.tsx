import { Box, Text } from "ink";
import { useMemo } from "react";

import { useSelect } from "../hooks/use-select.js";

import { calcScrollOffset, ScrollableList } from "./ScrollableList.js";

import type { SelectOption } from "../hooks/use-select.js";

const MAX_VISIBLE = 10;

export const SelectList = () => {
  const { visible, options, selectedIndex, selectedSet, multiSelect } = useSelect((s) => ({
    visible: s.visible,
    options: s.options,
    selectedIndex: s.selectedIndex,
    selectedSet: s.selectedSet,
    multiSelect: s.multiSelect,
  }));

  const scrollOffset = useMemo(() => {
    return calcScrollOffset(selectedIndex, options.length, MAX_VISIBLE);
  }, [selectedIndex, options.length]);

  if (!visible || options.length === 0) return null;

  const renderItem = (opt: SelectOption, index: number) => {
    const isCursor = index === selectedIndex;
    const isChecked = selectedSet.includes(index);
    const cursor = isCursor ? ">" : " ";

    let prefix = "";
    if (multiSelect) {
      prefix = isChecked ? " [x] " : " [ ] ";
    } else {
      prefix = " ";
    }

    return (
      <Text color={isCursor ? "cyan" : "gray"} bold={isCursor}>
        {cursor}
        {prefix}
        {opt.label}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <ScrollableList
        items={options as SelectOption[]}
        maxVisible={MAX_VISIBLE}
        scrollOffset={scrollOffset}
        renderItem={renderItem}
      />
    </Box>
  );
};
