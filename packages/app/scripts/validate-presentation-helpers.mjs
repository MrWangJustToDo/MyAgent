/**
 * Ensure app presentation helpers stay aligned with core writers (markers).
 *
 * Run: pnpm --filter @my-agent/app run validate:presentation-helpers
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appSummary = readFileSync(join(here, "../src/utils/compaction-summary.ts"), "utf8");
const coreSummary = readFileSync(join(here, "../../core/src/agent/compaction/compaction-summary.ts"), "utf8");

function constString(src, name) {
  const match = src.match(new RegExp(`export const ${name} = "([^"]+)"`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

assert.equal(
  constString(appSummary, "CONVERSATION_SUMMARY_START"),
  constString(coreSummary, "CONVERSATION_SUMMARY_START")
);
assert.equal(constString(appSummary, "CONVERSATION_SUMMARY_END"), constString(coreSummary, "CONVERSATION_SUMMARY_END"));

const start = constString(appSummary, "CONVERSATION_SUMMARY_START");
const end = constString(appSummary, "CONVERSATION_SUMMARY_END");
const body = "smoke summary";
const wrapped = `${start}\n\n${body}\n\n${end}\n\nContinue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.`;
assert.ok(wrapped.startsWith(start));
assert.ok(wrapped.includes(body));

console.log("presentation-helpers: ok");
