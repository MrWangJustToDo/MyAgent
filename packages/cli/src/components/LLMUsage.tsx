/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Box, Text } from "ink";

import { useAgentContext } from "../hooks/use-agent-context";

import type { TokenUsage } from "@my-agent/core";

export const LLMUsage = () => {
  // @ts-ignore
  const usage = useAgentContext((s) => s.context?.getTotalUsage() as TokenUsage);
  // @ts-ignore
  const percent = useAgentContext((s) => s.context?.getTokenLimitPercent() ?? 0);

  return usage ? (
    <Box>
      <Text color="gray" dimColor wrap="truncate">
        Tokens: {usage.inputTokens} in / {usage.outputTokens} out{percent > 0 ? ` (${percent.toFixed(0)}%)` : ""}
      </Text>
    </Box>
  ) : null;
};
