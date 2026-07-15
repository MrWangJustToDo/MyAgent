/**
 * Validates compact usage formatting for task headers / footer.
 *
 * Run: node packages/app/test/format-usage.test.mjs
 */
import assert from "node:assert/strict";

import { formatCompactNumber, formatUsageBrief } from "../dist/utils/format-usage.mjs";

assert.equal(formatCompactNumber(0), "0");
assert.equal(formatCompactNumber(342), "342");
assert.equal(formatCompactNumber(1500), "1.50k");
assert.equal(formatCompactNumber(1_200_000), "1.20M");

assert.equal(formatUsageBrief({ inputTokens: 1500, outputTokens: 42 }), "1.50k in / 42 out");
assert.equal(formatUsageBrief({ inputTokens: 0, outputTokens: 0 }), "0 in / 0 out");

console.log("format-usage validation passed");
