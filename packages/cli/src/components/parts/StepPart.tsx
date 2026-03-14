import { Box, Text } from "ink";

import type { StepRenderPart } from "@my-agent/core";

export interface StepPartProps {
  part: StepRenderPart;
}

export const StepPart = ({ part }: StepPartProps) => {
  if (!part.isComplete) return null;

  return (
    <Box marginBottom={1}>
      <Text color="gray" dimColor>
        Step {part.stepIndex + 1}
        {part.usage && ` - ${part.usage.totalTokens} tokens`}
        {part.finishReason && ` (${part.finishReason})`}
      </Text>
    </Box>
  );
};
