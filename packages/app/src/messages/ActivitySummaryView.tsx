import { memo } from "@my-react/react";
import { Text } from "ink";

import { COLORS } from "../theme/colors.js";

export type ActivitySummaryViewProps = {
  summary: string;
};

/** Muted one-line tool activity summary for compact transcript mode. */
export const ActivitySummaryView = memo(function ActivitySummaryView({ summary }: ActivitySummaryViewProps) {
  return (
    <Text color={COLORS.muted} dimColor>
      {"⚒️ ～"}
      {summary}
    </Text>
  );
});
