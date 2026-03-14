import { Box, Text } from "ink";

import type { UserRenderPart } from "@my-agent/core";

export interface UserPartProps {
  part: UserRenderPart;
}

export const UserPart = ({ part }: UserPartProps) => (
  <Box flexDirection="column" marginBottom={1}>
    <Box>
      <Text color="green" bold>
        You:
      </Text>
    </Box>
    <Box paddingLeft={1}>
      <Text wrap="wrap">{part.text}</Text>
    </Box>
  </Box>
);
