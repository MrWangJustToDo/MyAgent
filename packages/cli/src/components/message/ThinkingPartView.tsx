import { Box, Text } from "ink";

import type { ThinkingPart } from "@my-agent/core";

export interface ThinkingPartViewProps {
  part: ThinkingPart;
}

/** Render a thinking/reasoning part */
export const ThinkingPartView = ({ part }: ThinkingPartViewProps) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="magenta" dimColor italic>
      Thinking:
    </Text>
    <Box paddingLeft={2} borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="gray" dimColor wrap="wrap">
        {part.content}
      </Text>
    </Box>
  </Box>
);
