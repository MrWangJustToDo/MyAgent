import { Box } from "ink";
import { useEffect, useState } from "react";

import { useUserInput } from "../hooks/use-user-input.js";
import { HINT_ROTATE_INTERVAL_MS, currentInputHint, nextInputHint } from "../utils/input-hints.js";

import { MultiLineInput } from "./MultiLineInput.js";

export const UserInput = () => {
  const value = useUserInput((s) => s.value);
  const cursorPosition = useUserInput((s) => s.cursorPosition);
  const selectAll = useUserInput((s) => s.selectAll);
  const pendingPastes = useUserInput((s) => s.pendingPastes);
  const expandedPasteIndex = useUserInput((s) => s.expandedPasteIndex);

  const [hint, setHint] = useState(currentInputHint);

  // Rotate the placeholder hint while the input is empty; pause once the user
  // starts typing so the hint never churns under the cursor. The deck itself
  // lives in utils/input-hints.js, so a remount keeps the current hint.
  useEffect(() => {
    if (value) return;
    const id = setInterval(() => {
      setHint(nextInputHint());
    }, HINT_ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [value]);

  return (
    <Box flexDirection="column">
      <MultiLineInput
        value={value}
        placeholder={hint}
        cursorPosition={cursorPosition}
        selectAll={selectAll}
        pendingPastes={pendingPastes}
        expandedPasteIndex={expandedPasteIndex}
      />
    </Box>
  );
};
