import { useUserInput } from "../hooks/use-user-input.js";

import { MultiLineInput } from "./MultiLineInput.js";

export const UserInput = () => {
  const value = useUserInput((s) => s.value);
  const cursorPosition = useUserInput((s) => s.cursorPosition);
  const selectAll = useUserInput((s) => s.selectAll);

  return (
    <MultiLineInput
      value={value}
      placeholder="Type to start a Task"
      cursorPosition={cursorPosition}
      selectAll={selectAll}
    />
  );
};
