/**
 * Validates streaming output line helpers.
 *
 * Run: node packages/app/test/streaming-output-lines.test.mjs
 */
import assert from "node:assert/strict";

import {
  buildFixedStreamingWindow,
  padLatestLines,
  splitStreamingLines,
  takeLatestLines,
} from "../dist/utils/streaming-output-lines.mjs";

assert.deepEqual(splitStreamingLines(""), []);
assert.deepEqual(splitStreamingLines("a\nb"), ["a", "b"]);
assert.deepEqual(splitStreamingLines("a\nb\n"), ["a", "b"]);
assert.deepEqual(splitStreamingLines("a\n\nb\n"), ["a", "", "b"]);

assert.deepEqual(takeLatestLines(["a"], 3), ["a"]);
assert.deepEqual(takeLatestLines(["a", "b", "c", "d"], 3), ["b", "c", "d"]);
assert.deepEqual(takeLatestLines([], 2), []);

assert.deepEqual(padLatestLines(["a"], 3), ["", "", "a"]);
assert.deepEqual(padLatestLines(["a", "b", "c", "d"], 3), ["b", "c", "d"]);
assert.deepEqual(padLatestLines([], 2), ["", ""]);

const empty = buildFixedStreamingWindow("", 3);
assert.deepEqual(empty.lines, []);
assert.equal(empty.hidden, 0);

const waiting = buildFixedStreamingWindow("", 3, { emptyPlaceholder: "Waiting..." });
assert.deepEqual(waiting.lines, ["Waiting..."]);
assert.equal(waiting.hidden, 0);

const paddedWaiting = buildFixedStreamingWindow("", 3, {
  emptyPlaceholder: "Waiting...",
  padToMax: true,
});
assert.deepEqual(paddedWaiting.lines, ["", "", "Waiting..."]);

const overflowing = buildFixedStreamingWindow("1\n2\n3\n4\n5", 3);
assert.deepEqual(overflowing.lines, ["… 3", "4", "5"]);
assert.equal(overflowing.hidden, 2);

const growing = buildFixedStreamingWindow("line1\nline2", 5);
assert.deepEqual(growing.lines, ["line1", "line2"]);
assert.equal(growing.hidden, 0);

console.log("streaming-output-lines validation passed");
