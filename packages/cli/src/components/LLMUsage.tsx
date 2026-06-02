/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Box, Text } from "ink";

import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";

import { AnimateNumber } from "./AnimateNumber";

import type { TokenUsage } from "@my-agent/core";

export const LLMUsage = () => {
  // @ts-ignore
  const sessionId = useAgent((s) => s.agent?.sessionData?.id);
  // @ts-ignore
  const usage = useAgentContext((s) => s.context?.getTotalUsage() as TokenUsage);
  // @ts-ignore
  const percent = useAgentContext((s) => s.context?.getTokenLimitPercent() ?? 0);

  return usage ? (
    <Box key={sessionId}>
      <Text color="gray" dimColor wrap="truncate">
        Tokens: <AnimateNumber number={usage.inputTokens} /> in / <AnimateNumber number={usage.outputTokens} /> out
        {percent > 0 ? ` (${percent.toFixed(0)}%)` : ""}
      </Text>
    </Box>
  ) : null;
};
