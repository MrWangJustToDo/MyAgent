/**
 * Validation for subagent cancel notice appended into task summaries.
 *
 * Run: pnpm --filter @my-agent/core run validate:subagent-cancel-notice
 */

import assert from "node:assert/strict";

import { applySubagentCancelNotice, SUBAGENT_CANCELLED_NOTICE } from "../dist/dev.mjs";

assert.equal(applySubagentCancelNotice("partial findings", false), "partial findings");
assert.equal(applySubagentCancelNotice("(no summary)", true), SUBAGENT_CANCELLED_NOTICE);
assert.equal(applySubagentCancelNotice("   ", true), SUBAGENT_CANCELLED_NOTICE);

const withPartial = applySubagentCancelNotice("Now let me explore…", true);
assert.ok(withPartial.startsWith("Now let me explore…"));
assert.ok(withPartial.includes(SUBAGENT_CANCELLED_NOTICE));

const already = `${SUBAGENT_CANCELLED_NOTICE}`;
assert.equal(applySubagentCancelNotice(already, true), already);

console.log("subagent-cancel-notice validation passed");
