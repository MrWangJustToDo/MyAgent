import { Box, Text } from "ink";
import { useMemo } from "react";

import { useSelect } from "../hooks/use-select.js";
import { COLORS } from "../theme/colors.js";

import { calcScrollOffset, ScrollableList } from "./ScrollableList.js";

import type { SelectOption } from "../hooks/use-select.js";

const MAX_VISIBLE = 10;

export const SelectList = () => {
  const { visible, options, selectedIndex, selectedSet, multiSelect, freeformEnabled, freeformDraft } = useSelect(
    (s) => ({
      visible: s.visible,
      options: s.options,
      selectedIndex: s.selectedIndex,
      selectedSet: s.selectedSet,
      multiSelect: s.multiSelect,
      freeformEnabled: s.freeformEnabled,
      freeformDraft: s.freeformDraft,
    })
  );

  const scrollOffset = useMemo(() => {
    return calcScrollOffset(selectedIndex, options.length, MAX_VISIBLE);
  }, [selectedIndex, options.length]);

  if (!visible || options.length === 0) return null;

  const freeformIdx = freeformEnabled ? options.length - 1 : -1;

  const renderItem = (opt: SelectOption, index: number) => {
    const isCursor = index === selectedIndex;
    const isChecked = selectedSet.includes(index);
    const cursor = isCursor ? ">" : " ";
    const color = isCursor ? COLORS.primary : COLORS.muted;

    // For the free-form row, show the staged draft text instead of the placeholder
    // label once the user has typed something.
    const isFreeformRow = index === freeformIdx;
    const label = isFreeformRow && freeformDraft ? freeformDraft : opt.label;

    let prefix = "";
    if (multiSelect) {
      prefix = isChecked ? " [x] " : " [ ] ";
    } else {
      prefix = " ";
    }

    // Cursor/prefix stay in a fixed column; label wraps in its own box so
    // continuation lines hang under the label (not under `>`).
    return (
      <Box flexDirection="row" width="100%">
        <Box flexShrink={0}>
          <Text color={color} bold={isCursor}>
            {cursor}
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={color} bold={isCursor} wrap="wrap">
            {label}
          </Text>
        </Box>
      </Box>
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
