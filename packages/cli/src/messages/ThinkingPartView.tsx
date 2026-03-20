import { Box, Text } from "ink";

import { Spinner } from "../components/Spinner";

import type { ReasoningUIPart } from "ai";

export interface ThinkingPartViewProps {
  part: ReasoningUIPart;
}

/** Render a reasoning/thinking part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => {
  return (
    <Box paddingLeft={2} paddingX={1}>
      {part.state === "streaming" ? <Spinner /> : <Text color="green">✓</Text>}
      <Text> </Text>
      <Text color="gray" dimColor wrap="wrap" italic>
        Thinking...
      </Text>
    </Box>
  );
};

ThinkingPartView.displayName = "ThinkingPartView";
