import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text } from "ink";

import type { ErrorRenderPart } from "@my-agent/core";

export interface ErrorPartProps {
  part: ErrorRenderPart;
}

export const ErrorPart = ({ part }: ErrorPartProps) => (
  <Box marginBottom={1}>
    <TitledBox titles={["Error"]} borderStyle="round" borderColor="red">
      <Text color="red">{String(part.error)}</Text>
    </TitledBox>
  </Box>
);
