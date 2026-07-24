/**
 * Validates edit match resolution (exact / unescape / fuzzy / startLine / hints).
 *
 * Run: pnpm --filter @my-agent/core run validate:find-edit-match
 */
import assert from "node:assert/strict";

import {
  applyResolvedEdit,
  expandMatchVariants,
  formatNotFoundHint,
  resolveEditMatch,
  START_LINE_TOLERANCE,
  unescapeCommonEscapes,
} from "../dist/dev.mjs";

// On disk: template literal containing escaped backticks (\` … \`)
const fileWithBacktick = "description: `Edits via the \\`edits\\` array.`;\n";
const correctNeedle = "description: `Edits via the \\`edits\\` array.`;";

// Exact match when the model quotes the file correctly
const exactBacktick = resolveEditMatch(fileWithBacktick, correctNeedle, "description: `ok`;");
assert.ok(!("error" in exactBacktick));
assert.equal(exactBacktick.mode, "exact");

// Over-escaped needle (extra backslashes) → unescape variant hits the file
const overEscapedNeedle = "description: `Edits via the \\\\`edits\\\\` array.`;";
assert.ok(expandMatchVariants(overEscapedNeedle).includes(correctNeedle));
const unesc = resolveEditMatch(fileWithBacktick, overEscapedNeedle, "description: `ok`;");
assert.ok(!("error" in unesc));
assert.equal(unesc.mode, "unescape");
assert.equal(unesc.matchedOld, correctNeedle);
assert.equal(applyResolvedEdit(fileWithBacktick, unesc, false), "description: `ok`;\n");

// Newline over-escape
assert.equal(unescapeCommonEscapes("a\\nb"), "a\nb");
const nl = resolveEditMatch("a\nb\n", "a\\nb", "x");
assert.ok(!("error" in nl));
assert.equal(nl.mode, "unescape");

// Exact unique
const exact = resolveEditMatch("hello world\n", "hello", "hi");
assert.ok(!("error" in exact));
assert.equal(exact.mode, "exact");
assert.equal(applyResolvedEdit("hello world\n", exact, false), "hi world\n");

// Multiple matches need startLine or replaceAll
const multi = resolveEditMatch("aa aa aa\n", "aa", "b");
assert.ok("error" in multi);

const multiLine = resolveEditMatch("aa\nbb\naa\n", "aa", "XX", { startLine: 3 });
assert.ok(!("error" in multiLine));
assert.equal(applyResolvedEdit("aa\nbb\naa\n", multiLine, false), "aa\nbb\nXX\n");

// startLine too far from nearest match → error
const far = resolveEditMatch("aa\nbb\naa\n", "aa", "XX", { startLine: 99 });
assert.ok("error" in far);
assert.match(far.error, /max ±/);
assert.equal(START_LINE_TOLERANCE, 20);

const multiAll = resolveEditMatch("aa aa\n", "aa", "b", { replaceAll: true });
assert.ok(!("error" in multiAll));
assert.equal(applyResolvedEdit("aa aa\n", multiAll, true), "b b\n");

// Fuzzy smart quotes
const curly = "say \u201Chello\u201D\n";
const fuzzy = resolveEditMatch(curly, 'say "hello"\n', "ok\n");
assert.ok(!("error" in fuzzy));
assert.equal(fuzzy.mode, "fuzzy");

// Not-found hint points at a similar line
const missing = resolveEditMatch(
  "alpha\nfunction createEditFileTool() {\nomega\n",
  "function createEditFileToool() {",
  "x"
);
assert.ok("error" in missing);
assert.match(missing.error, /Nearest similar line 2/);
assert.match(formatNotFoundHint("const createEditFileTool = () => {\n", "createEditFileTool"), /Nearest similar line 1/);

console.log("validate-find-edit-match: ok");
