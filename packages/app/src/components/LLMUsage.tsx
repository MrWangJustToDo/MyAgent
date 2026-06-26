/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Box, Text } from "ink";

import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";

import { AnimateNumber } from "./AnimateNumber";

import type { TokenUsage } from "@my-agent/core";

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export const LLMUsage = () => {
  // @ts-ignore
  const sessionId = useAgent((s) => s.agent?.sessionData?.id);
  // version included in selectors to force re-evaluation after context.reset() + bump()
  // @ts-ignore
  const usage = useAgentContext((s) => (s.version, s.context?.getTotalUsage() as TokenUsage));
  // @ts-ignore
  const percent = useAgentContext((s) => (s.version, s.context?.getTokenLimitPercent() ?? 0));
  // @ts-ignore
  const cost = useAgentContext((s) => (s.version, s.context?.getTotalCost() ?? 0));

  return usage ? (
    <Box key={sessionId} gap={1}>
      <Text color="gray" dimColor wrap="truncate">
        Tokens: <AnimateNumber number={usage.inputTokens} /> in / <AnimateNumber number={usage.outputTokens} /> out
        {percent > 0 ? ` (${percent.toFixed(0)}%)` : ""}
      </Text>
      {cost > 0 && (
        <Text color="yellow" dimColor wrap="truncate">
          {formatCost(cost)}
        </Text>
      )}
    </Box>
  ) : null;
};
