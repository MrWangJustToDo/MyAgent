import { Box } from "ink";
import TextInput from "ink-text-input";

import { useUserInput } from "../hooks/use-user-input.js";

export const UserInput = () => {
  const { value, key } = useUserInput.useShallowStableSelector((s) => s);

  // Key on Box forces TextInput remount to reset internal cursor position
  return (
    <Box key={key}>
      <TextInput value={value} onChange={() => void 0} />
    </Box>
  );
};
