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
 * Number of Monday-aligned week columns the heatmap MAY occupy for a terminal of
 * `screenWidth` — as many as fit, capped at `maxWeeks`. A wide terminal therefore
 * fills its width with more history instead of leaving the right side blank; a
 * narrow one shows fewer weeks.
 */
export function usageHeatmapColumns(screenWidth: number, maxWeeks: number): number {
  const fit = Math.floor((screenWidth - HEATMAP_LABEL_WIDTH - HEATMAP_GRAPH_GUTTER) / HEATMAP_CELL.length);
  return Math.max(1, Math.min(maxWeeks, fit));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** How far back the month-aligned walk below looks (one year plus slack). */
const MAX_MONTHS_BACK = 24;

/** Local midnight of `date`, so week math is immune to the time of day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday (local midnight) of the week containing `date`. */
export function heatmapWeekMonday(date: Date): Date {
  const today = startOfDay(date);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  return monday;
}

/**
 * First Monday of a month — the start of that month's first full week column.
 * `month` may be out of range; `Date` normalizes it (month 12 → next January).
 */
export function heatmapMonthStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const dow = (first.getDay() + 6) % 7; // 0 = Monday
  first.setDate(first.getDate() + ((7 - dow) % 7));
  return first;
}

export interface UsageHeatmapWindow {
  /** Monday of the oldest rendered week column. */
  startMonday: Date;
  /** Number of week columns — also the span in weeks. */
  weeks: number;
}

/**
 * The window the graph actually paints: the oldest week column plus the column
 * count, chosen so the graph
 *
 * - starts on a month boundary, so the left edge never shows a slice of a month
 *   (a 1-column month label cannot fit its own box and would wrap), and
 * - keeps the longest such span that still fits `usageHeatmapColumns()`, so a
 *   narrow terminal drops trailing weeks instead of shortening the first month.
 *
 * Never wider than `maxWeeks`. Weeks are Monday-aligned and end on the current
 * week, so the span rolls forward with the date instead of restarting in January.
 */
export function usageHeatmapWindow(
  screenWidth: number,
  maxWeeks: number,
  today: Date = new Date()
): UsageHeatmapWindow {
  const limit = usageHeatmapColumns(screenWidth, maxWeeks);
  const thisMonday = heatmapWeekMonday(today);
  const day = startOfDay(today);

  let best: UsageHeatmapWindow | undefined;
  for (let back = 0; back <= MAX_MONTHS_BACK; back++) {
    const startMonday = heatmapMonthStart(day.getFullYear(), day.getMonth() - back);
    if (startMonday.getTime() > thisMonday.getTime()) continue; // no full week yet this month
    const weeks = Math.round((thisMonday.getTime() - startMonday.getTime()) / WEEK_MS) + 1;
    if (weeks > limit) break; // earlier months only add columns
    best = { startMonday, weeks };
  }
  if (best) return best;

  // Too narrow for even the current month's weeks: fall back to a plain
  // width-sized span. It may clip a month, and the header truncates such a label.
  const startMonday = new Date(thisMonday);
  startMonday.setDate(thisMonday.getDate() - (limit - 1) * 7);
  return { startMonday, weeks: limit };
}
