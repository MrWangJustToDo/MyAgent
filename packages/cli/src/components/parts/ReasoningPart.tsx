import { Box, Text } from "ink";

import type { ReasoningRenderPart } from "@my-agent/core";

export interface ReasoningPartProps {
  part: ReasoningRenderPart;
}

export const ReasoningPart = ({ part }: ReasoningPartProps) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="magenta" dimColor italic>
      Thinking:
    </Text>
    <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="gray" dimColor wrap="wrap">
        {part.text}
        {!part.isComplete && "..."}
      </Text>
    </Box>
  </Box>
);
