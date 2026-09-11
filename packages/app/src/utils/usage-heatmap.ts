/**
 * Geometry for the `/usage` contribution heatmap.
 *
 * Kept pure and framework-free so the command (which decides how many weeks of
 * history to fetch) and the React component (which paints the columns) share a
 * single sizing rule — and so it can be unit-tested without Ink.
 */

/** Two space characters — the inked "pixel" for every cell. */
export const HEATMAP_CELL = "  ";

/** Width of the "Mon " day-label column. */
export const HEATMAP_LABEL_WIDTH = 4;

/**
 * Horizontal space the graph box consumes beyond the grid itself (the
 * HalfLinePaddedBox left padding plus a little breathing room), subtracted when
 * deciding how many week columns fit.
 */
export const HEATMAP_GRAPH_GUTTER = 3;

/**
 * Number of Monday-aligned week columns the heatmap should render for a
 * terminal of `screenWidth` — as many as fit, capped at `maxWeeks`. A wide
 * terminal therefore fills its width with more history instead of leaving the
 * right side blank; a narrow one shows fewer weeks.
 */
export function usageHeatmapColumns(screenWidth: number, maxWeeks: number): number {
  const fit = Math.floor((screenWidth - HEATMAP_LABEL_WIDTH - HEATMAP_GRAPH_GUTTER) / HEATMAP_CELL.length);
  return Math.max(1, Math.min(maxWeeks, fit));
}
