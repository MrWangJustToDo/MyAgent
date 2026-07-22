import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";

/** Display-only confirm prompt. Key handling lives in {@link useAgentKeybindings}. */
export const ExtensionConfirm = ({ confirm }: { confirm: { id: string; question: string } }) => {
  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text color={COLORS.warning} bold>
        Confirm:
      </Text>
      <Text color={COLORS.primary}>{confirm.question}</Text>
      <Text color={COLORS.muted} dimColor>
        y: approve | n / Esc: deny
      </Text>
    </Box>
  );
};
