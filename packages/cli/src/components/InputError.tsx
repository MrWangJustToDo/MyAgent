import { Box, Text } from "ink";

import { useUserInput } from "../hooks/use-user-input.js";

export const InputError = () => {
  const inputError = useUserInput((s) => s.inputError);

  if (!inputError) return null;

  return (
    <Box>
      <Text color="red">{inputError}</Text>
    </Box>
  );
};
