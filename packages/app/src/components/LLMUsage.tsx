import { Box, Text } from "ink";

import { useAgentUsage } from "../hooks/use-agent-usage";
import { COLORS } from "../theme/colors.js";
import { formatContextUsage } from "../utils/format-usage.js";

import { AnimateNumber } from "./AnimateNumber";

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Footer usage: lifetime in/out (billing) · context fill · cost.
 * Context % is window.input / tokenLimit — not derived from lifetime totals.
 */
export const LLMUsage = () => {
  const { usage } = useAgentUsage();

  if (!usage) return null;

  const contextLabel = formatContextUsage({
    windowInputTokens: usage.window.inputTokens,
    tokenLimit: usage.tokenLimit,
    percent: usage.percent,
  });

  return (
    <Box gap={1}>
      <Text color={COLORS.muted} dimColor wrap="truncate">
        <AnimateNumber number={usage.total.inputTokens} />
        ↓/
        <AnimateNumber number={usage.total.outputTokens} />↑{contextLabel ? ` · ${contextLabel}` : ""}
      </Text>
      {usage.cost > 0 && (
        <Text color={COLORS.warning} dimColor wrap="truncate">
          {formatCost(usage.cost)}
        </Text>
      )}
    </Box>
  );
};
