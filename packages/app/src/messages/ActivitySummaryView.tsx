import { Box, Text } from "ink";
import { memo } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useSize } from "../hooks";
import { BG, COLORS } from "../theme/colors.js";

export type ActivitySummaryViewProps = {
  summary: string;
};

/**
 * Muted tool activity summary block for compact transcript mode.
 * Uses the same BG.toolResult background as run_command output blocks.
 */
export const ActivitySummaryView = memo(function ActivitySummaryView({ summary }: ActivitySummaryViewProps) {
  const screenWidth = useSize((s) => s.state.screenWidth);
  // Same box metrics as ToolOutputView: message container paddingX=1 + tool
  // column paddingLeft=2 → width compensates so the right edge aligns with
  // user message boxes (screenWidth - 2).
  const boxWidth = Math.max(screenWidth - 4, 1);

  return (
    <Box paddingLeft={2}>
      <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={COLORS.muted} dimColor>
            {summary}
          </Text>
        </Box>
      </HalfLinePaddedBox>
    </Box>
  );
});
