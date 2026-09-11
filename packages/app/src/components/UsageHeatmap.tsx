import { Box, Text } from "ink";

import { useSize } from "../hooks/use-size.js";
import { BG, COLORS, interpolateColor } from "../theme/colors.js";
import {
  HEATMAP_CELL as CELL,
  HEATMAP_LABEL_WIDTH as LABEL_WIDTH,
  usageHeatmapWindow,
} from "../utils/usage-heatmap.js";

import type { DailyUsageBucket } from "@my-agent/core";

// ============================================================================
// GitHub-style contribution heatmap for /usage.
//
// Mirrors the reference layout (column-major): each week is a vertical column
// of 7 cells (Mon..Sun), several week columns sit side-by-side, and the day-of-
// week labels live in their own left column. The month header is a row of
// boxes each sized to the weeks that month spans, so it lines up with the
// columns below. The window itself (oldest column + span) comes from
// `usageHeatmapWindow`, which always starts on a month boundary. Colors are
// derived from the active theme palette (BG.* / COLORS.success) so the graph
// stays on-theme in light/dark modes.
// ============================================================================

/** Day rows, top → bottom (Monday-based week start). */
const DAY_ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Number of heat levels above empty (1..LEVELS = increasingly green). */
const LEVELS = 6;

/** Background for a given heat level. Level 0 (no usage / nonexistent day)
 *  is transparent — only days with activity are tinted, like GitHub. */
function levelColor(level: number): string | undefined {
  if (level <= 0) return undefined;
  const factor = level / LEVELS;
  return interpolateColor(BG.diffContext, COLORS.success, 0.2 + 0.8 * factor);
}

function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface UsageHeatmapProps {
  daily: DailyUsageBucket[];
  weeks: number;
}

export const UsageHeatmap = ({ daily, weeks }: UsageHeatmapProps) => {
  const screenWidth = useSize((s) => s.state.screenWidth) || 80;

  const byDay = new Map(daily.map((d) => [d.date, d.totalTokens]));
  const maxDay = daily.reduce((m, d) => Math.max(m, d.totalTokens), 0);

  // Fill the available width (label column + cells) with whole months, up to the
  // requested span; the window keeps its oldest column on a month boundary.
  const labelW = LABEL_WIDTH; // "Mon " day-label column
  const cellW = CELL.length; // 2
  const { startMonday: start, weeks: cols } = usageHeatmapWindow(screenWidth, weeks);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Build one column per week: 7 day cells (Mon..Sun). `null` = future day.
  const columns: Array<Array<{ level: number } | null>> = [];
  const weekMonths: number[] = [];
  for (let w = 0; w < cols; w++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + w * 7);
    weekMonths.push(monday.getMonth());
    const col: Array<{ level: number } | null> = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(monday);
      cellDate.setDate(monday.getDate() + d);
      if (cellDate.getTime() > today.getTime()) {
        col.push(null);
        continue;
      }
      const tokens = byDay.get(dayKey(cellDate)) ?? 0;
      const level =
        tokens <= 0 || maxDay <= 0 ? 0 : Math.min(LEVELS, Math.max(1, Math.ceil((tokens / maxDay) * LEVELS)));
      col.push({ level });
    }
    columns.push(col);
  }

  // Group columns into month spans for the header row (each box width = the
  // number of weeks that month covers × cell width, so columns line up).
  const monthSpans: Array<{ name: string; count: number }> = [];
  for (const month of weekMonths) {
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.name === MONTH_NAMES[month]) last.count++;
    else monthSpans.push({ name: MONTH_NAMES[month], count: 1 });
  }

  const renderCell = (level: number) => <Text backgroundColor={levelColor(level)}>{CELL}</Text>;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {/* Day-of-week labels (left column), with a leading blank row aligned
            to the month header row above the columns. */}
        <Box flexDirection="column" width={labelW}>
          <Text> </Text>
          {DAY_ROWS.map((label) => (
            <Text key={label} color={COLORS.muted}>
              {label}
            </Text>
          ))}
        </Box>
        {/* Graph: month header + week columns. */}
        <Box flexDirection="column">
          <Box flexDirection="row">
            {monthSpans.map((s, i) => {
              // Widen only the LAST month to at least its label length: the
              // current month is often one or two columns, and the extra width
              // spills into the blank area to the right, so its label still
              // starts where its columns do. Earlier months keep their exact
              // span to stay aligned with the cells, truncating the label
              // rather than wrapping it when the span is narrower than the name.
              const spanW = s.count * cellW;
              const width = i === monthSpans.length - 1 ? Math.max(spanW, s.name.length) : spanW;
              return (
                <Box key={i} width={width}>
                  <Text color={COLORS.muted}>{s.name.slice(0, width)}</Text>
                </Box>
              );
            })}
          </Box>
          <Box flexDirection="row">
            {columns.map((col, w) => (
              <Box key={w} flexDirection="column">
                {col.map((cell) => renderCell(cell ? cell.level : 0))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
