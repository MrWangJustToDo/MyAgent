/**
 * Validates /usage heatmap geometry:
 *
 * - `usageHeatmapColumns` — the graph fills the terminal width (up to one year)
 *   instead of a fixed six-month block.
 * - `usageHeatmapWindow` — the painted span starts on a month boundary, so the
 *   left edge never shows a slice of a month (a 1-column month label cannot fit
 *   its own box and would wrap), and it rolls forward with the date instead of
 *   restarting in January.
 *
 * Run: node packages/app/test/usage-heatmap-columns.test.mjs
 */
import assert from "node:assert/strict";

import { usageHeatmapColumns, usageHeatmapWindow } from "../dist/utils/usage-heatmap.mjs";

// Typical terminal: fit = floor((80 - 4 - 3) / 2) = 36 columns (< one year).
assert.equal(usageHeatmapColumns(80, 52), 36);

// Wide terminal: fit exceeds a year, so the span caps at maxWeeks.
assert.equal(usageHeatmapColumns(120, 52), 52);
assert.equal(usageHeatmapColumns(200, 6), 6, "an explicit smaller span wins");

// Narrow terminal: fewer columns, never below one.
assert.equal(usageHeatmapColumns(10, 52), 1);
assert.equal(usageHeatmapColumns(7, 52), 1);
assert.equal(usageHeatmapColumns(0, 52), 1, "unreported width still yields a valid column");

// Monotonic in width — a wider terminal never shows fewer columns.
{
  let prev = 0;
  for (let w = 0; w <= 200; w++) {
    const cols = usageHeatmapColumns(w, 52);
    assert.ok(cols >= prev, `columns must not decrease as width grows (w=${w})`);
    prev = cols;
  }
}

// ============================================================================
// Window: month-aligned start, rolling end
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date(2026, 8, 12); // 2026-09-12

const window = (width, maxWeeks = 52, today = TODAY) => usageHeatmapWindow(width, maxWeeks, today);

// The oldest column is the Monday that opens a month, so that month always
// contributes at least 4 columns and its 3-character label always fits.
for (const width of [60, 80, 100, 120, 200]) {
  const { startMonday, weeks } = window(width);
  assert.equal(startMonday.getDay(), 1, `width=${width}: starts on a Monday`);
  assert.ok(startMonday.getDate() <= 7, `width=${width}: starts on the month's first Monday`);
  assert.equal(
    new Date(startMonday.getTime() + 21 * DAY_MS).getMonth(),
    startMonday.getMonth(),
    `width=${width}: the leading month spans 4+ columns`
  );
  assert.ok(weeks >= 1 && weeks <= usageHeatmapColumns(width, 52), `width=${width}: the span fits the width`);
}

// Too narrow for a full month — degrades to a single week column.
{
  const { startMonday, weeks } = window(0);
  assert.equal(weeks, 1);
  assert.equal(startMonday.getDay(), 1);
}

// The span ends on the current week and rolls forward with the date.
for (const month of [0, 3, 8, 11]) {
  const today = new Date(2026, month, 15);
  const { startMonday, weeks } = window(120, 52, today);
  const end = new Date(startMonday.getTime() + (weeks - 1) * 7 * DAY_MS);
  assert.ok(Math.abs(end.getTime() - today.getTime()) < 7 * DAY_MS, `month=${month}: ends on today's week`);
}

// An explicit span caps the window, and re-deriving it from the reported span
// yields the same window (the command and the component must agree).
{
  assert.ok(window(200, 12).weeks <= 12, "an explicit span caps the window");
  for (const width of [60, 80, 120, 200]) {
    const first = window(width);
    const again = window(width, first.weeks);
    assert.equal(again.weeks, first.weeks, `width=${width}: window is idempotent`);
    assert.equal(again.startMonday.getTime(), first.startMonday.getTime(), `width=${width}: same start`);
  }
}

// A wider terminal never shows fewer weeks (rounding to a month boundary only
// ever extends the span).
{
  let prev = 0;
  for (let w = 0; w <= 200; w++) {
    const { weeks } = window(w);
    assert.ok(weeks >= prev, `the span must not decrease as width grows (w=${w})`);
    prev = weeks;
  }
}

console.log("usage-heatmap-columns validation passed");
