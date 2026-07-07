import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";
import { COLORS } from "../theme/colors.js";

import type { ThinkingPart } from "@tanstack/ai";

export interface ThinkingPartViewProps {
  part: ThinkingPart;
}

/** Render a thinking part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => {
  const hasContent = part.content.trim().length > 0;

  return (
    <Box paddingLeft={2}>
      {hasContent ? <Text color={COLORS.success}>✓</Text> : <Spinner />}
      <Text> </Text>
      <Text color={COLORS.muted} dimColor italic>
        Thinking...
      </Text>
    </Box>
  );
};

ThinkingPartView.displayName = "ThinkingPartView";
