import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";
import { KeyLabel } from "../utils/keyboard-labels.js";

/** Display-only confirm prompt. Key handling lives in {@link useAgentKeybindings}. */
export const ExtensionConfirm = ({ confirm }: { confirm: { id: string; question: string } }) => {
  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text color={COLORS.warning} bold>
        Confirm:
      </Text>
      <Text color={COLORS.primary}>{confirm.question}</Text>
      <Text color={COLORS.muted} dimColor>
        {KeyLabel.y}: approve | {KeyLabel.n} / {KeyLabel.esc}: deny
      </Text>
    </Box>
  );
};
