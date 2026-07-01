import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";
import { COLORS } from "../theme/colors.js";

import type { ReasoningUIPart } from "ai";

export interface ThinkingPartViewProps {
  part: ReasoningUIPart;
}

/** Render a reasoning/thinking part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => {
  return (
    <Box paddingLeft={2}>
      {part.state === "streaming" ? <Spinner /> : <Text color={COLORS.success}>✓</Text>}
      <Text> </Text>
      <Text color={COLORS.muted} dimColor italic>
        Thinking...
      </Text>
    </Box>
  );
};

ThinkingPartView.displayName = "ThinkingPartView";
