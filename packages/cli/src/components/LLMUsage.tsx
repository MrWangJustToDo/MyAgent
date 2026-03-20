import { Box, Text } from "ink";

import { useAgentContext } from "../hooks/use-agent-context";

import type { TokenUsage } from "@my-agent/core";

export const LLMUsage = () => {
  const usage = useAgentContext((s) => s.context?.getUsage() as TokenUsage);

  return usage ? (
    <Box>
      <Text color="gray" dimColor wrap="truncate">
        Tokens: {usage.inputTokens} in / {usage.outputTokens} out
      </Text>
    </Box>
  ) : null;
};
