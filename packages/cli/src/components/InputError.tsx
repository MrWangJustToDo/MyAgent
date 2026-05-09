import { Box, Text } from "ink";

import { useUserInput } from "../hooks/use-user-input.js";

const FEEDBACK_COLORS = {
  success: "green",
  info: "cyan",
  error: "red",
} as const;

export const InputError = () => {
  const inputError = useUserInput((s) => s.inputError);
  const inputFeedback = useUserInput((s) => s.inputFeedback);

  if (!inputError && !inputFeedback) return null;

  if (inputFeedback) {
    return (
      <Box flexDirection="column">
        <Text color={FEEDBACK_COLORS[inputFeedback.type]}>{inputFeedback.text}</Text>
        <Box height={1} flexGrow={1} flexShrink={0} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red">{inputError}</Text>
      <Box height={1} flexGrow={1} flexShrink={0} />
    </Box>
  );
};
