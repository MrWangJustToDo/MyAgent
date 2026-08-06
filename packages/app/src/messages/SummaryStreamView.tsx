/**
 * Fixed-height summary stream window (task / compact).
 */

import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";

export interface SummaryStreamViewProps {
  rows: string[];
  /** Reserve this many rows even when empty (default: rows.length or 0). */
  height?: number;
}

export const SummaryStreamView = ({ rows, height }: SummaryStreamViewProps) => {
  if (rows.length === 0 && (height == null || height <= 0)) {
    return null;
  }

  const displayRows = rows.length > 0 ? rows : [];
  const boxHeight = height ?? displayRows.length;
  if (boxHeight <= 0) return null;

  const padded =
    displayRows.length >= boxHeight
      ? displayRows.slice(0, boxHeight)
      : [...displayRows, ...Array.from({ length: boxHeight - displayRows.length }, () => "")];

  return (
    <Box flexDirection="column" paddingLeft={2} height={boxHeight} flexShrink={0}>
      {padded.map((line, i) => (
        <Text key={`summary-${i}`} color={COLORS.muted} dimColor wrap="truncate-end">
          {line.length > 0 ? line : " "}
        </Text>
      ))}
    </Box>
  );
};
