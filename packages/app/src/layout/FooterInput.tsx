import { Box, Text } from "ink";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { UserInput } from "../components/UserInput.js";
import { BG, COLORS } from "../theme/colors.js";

/** Input prompt line: freeform (deny reason / answer) or the normal `>` prompt. */
export const FooterInput = ({
  showFreeformInput,
  freeformLabel,
  isInputEnabled,
  showSelectList,
}: {
  showFreeformInput: boolean;
  freeformLabel: string;
  isInputEnabled: boolean;
  showSelectList: boolean;
}) => (
  <HalfLinePaddedBox backgroundColor={BG.input}>
    <Box flexDirection="row">
      <Box flexShrink={0}>
        {showFreeformInput ? (
          <Text color={COLORS.warning} bold>
            {" "}
            {freeformLabel}
          </Text>
        ) : (
          <Text color={COLORS.accent} bold>
            {" > "}
          </Text>
        )}
      </Box>
      {isInputEnabled && !showSelectList ? (
        <UserInput />
      ) : isInputEnabled && showSelectList ? (
        <Text color={COLORS.muted} dimColor>
          Use arrows to select
        </Text>
      ) : (
        <Text color={COLORS.muted} dimColor>
          Processing...
        </Text>
      )}
    </Box>
  </HalfLinePaddedBox>
);
