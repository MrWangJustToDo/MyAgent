/**
 * Validates compaction summary marker extraction — regression for summaries
 * whose body quotes the markers verbatim (nested `[CONVERSATION SUMMARY]` /
 * `[END SUMMARY]`) being truncated at a premature end marker.
 *
 * Run: node packages/app/test/compaction-summary.test.mjs
 */
import assert from "node:assert/strict";

import {
  CONVERSATION_SUMMARY_END,
  CONVERSATION_SUMMARY_START,
  extractCompactionSummaryBody,
  formatCompactionSummaryContent,
  hasOuterEndMarker,
  isCompactionSummaryText,
} from "../dist/index.mjs";

const START = CONVERSATION_SUMMARY_START;
const END = CONVERSATION_SUMMARY_END;

// -- Plain passthrough -----------------------------------------------------

assert.equal(extractCompactionSummaryBody("  hello world  "), "hello world");
assert.equal(extractCompactionSummaryBody(""), undefined);
assert.equal(isCompactionSummaryText("plain text"), false);
assert.equal(isCompactionSummaryText(`${START}\n\nbody`), true);

// -- Basic wrapped extraction -----------------------------------------------

const basic = formatCompactionSummaryContent("some summary body");
const basicBody = extractCompactionSummaryBody(basic);
assert.ok(basicBody);
assert.equal(basicBody, "some summary body");
assert.equal(hasOuterEndMarker(basic), true);

// -- Nested markers inside the body (the regression) ------------------------
// The body quotes the markers verbatim. Only the final solo-line END is the
// real wrapper; the inline occurrences must NOT truncate the body.
const nestedBody = [
  "## Goal",
  "Explain the `" + START + "` / `" + END + "` marker pair.",
  "## Tail",
  "This must survive extraction.",
].join("\n");
const wrapped = formatCompactionSummaryContent(nestedBody);

const extracted = extractCompactionSummaryBody(wrapped);
assert.ok(extracted, "should extract a body");
assert.equal(extracted, nestedBody, "body must not be truncated at nested markers");
assert.ok(extracted.includes(END), "nested quoted END must be kept");
assert.ok(extracted.includes("This must survive extraction"), "tail must survive");
assert.equal(hasOuterEndMarker(wrapped), true);

// -- Streaming: nested END arrives before the outer END ---------------------
// While streaming, the real outer END has not arrived yet. The nested quoted
// END must not freeze the body at a premature cut — text past it must keep
// streaming through (not be truncated away).
const midStream = `${START}\n\n## Goal\nExplain the \`${END}\` marker.\n## Tail\nThis must survive extraction.`;
assert.equal(hasOuterEndMarker(midStream), false, "no solo END yet");
const midStreamBody = extractCompactionSummaryBody(midStream);
assert.ok(midStreamBody, "streamed partial should still yield body text");
assert.ok(midStreamBody.includes("This must survive"), "streaming must not truncate at nested END");

// -- False positive guard ---------------------------------------------------
// A user message that merely starts with the marker but has no real wrapper.
const fake = `${START} is what I want to discuss`;
assert.equal(hasOuterEndMarker(fake), false);
// Without a solo END, extraction returns everything after the START marker.
assert.equal(extractCompactionSummaryBody(fake), "is what I want to discuss");

// -- Multiple solo-line ENDs: take the last one -----------------------------
const multiEnd = `${START}\n\npart1\n\n${END}\n\npart2\n\n${END}`;
assert.equal(extractCompactionSummaryBody(multiEnd), "part1\n\n" + END + "\n\npart2");

console.log("compaction-summary tests passed");
