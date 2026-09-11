/**
 * Validates /usage heatmap column sizing — the graph fills the terminal width
 * (up to one year) instead of a fixed six-month block.
 *
 * Run: node packages/app/test/usage-heatmap-columns.test.mjs
 */
import assert from "node:assert/strict";

import { usageHeatmapColumns } from "../dist/utils/usage-heatmap.mjs";

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

console.log("usage-heatmap-columns validation passed");
