import { Box, Text } from "ink";

import { useAgentUsage } from "../hooks/use-agent-usage";
import { COLORS } from "../theme/colors.js";

import { AnimateNumber } from "./AnimateNumber";

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export const LLMUsage = () => {
  const { usage } = useAgentUsage();

  if (!usage) return null;

  return (
    <Box gap={1}>
      <Text color={COLORS.muted} dimColor wrap="truncate">
        <AnimateNumber number={usage.total.inputTokens} /> in / <AnimateNumber number={usage.total.outputTokens} /> out
        {usage.percent > 0 ? ` (${usage.percent.toFixed(0)}%)` : ""}
      </Text>
      {usage.cost > 0 && (
        <Text color={COLORS.warning} dimColor wrap="truncate">
          {formatCost(usage.cost)}
        </Text>
      )}
    </Box>
  );
};
