import { Box } from "ink";

import { useUserInput } from "../hooks/use-user-input.js";

import { MultiLineInput } from "./MultiLineInput.js";

export const UserInput = () => {
  const value = useUserInput((s) => s.value);
  const cursorPosition = useUserInput((s) => s.cursorPosition);
  const selectAll = useUserInput((s) => s.selectAll);
  const pendingPastes = useUserInput((s) => s.pendingPastes);
  const expandedPasteIndex = useUserInput((s) => s.expandedPasteIndex);

  return (
    <Box flexDirection="column">
      <MultiLineInput
        value={value}
        placeholder="Type to start a Task"
        cursorPosition={cursorPosition}
        selectAll={selectAll}
        pendingPastes={pendingPastes}
        expandedPasteIndex={expandedPasteIndex}
      />
    </Box>
  );
};
