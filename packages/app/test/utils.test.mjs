import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { formatDuration, formatToolArgs, formatToolInput, formatToolOutput, getDurationMs, getToolCallColor } =
  await import(new URL("../dist/index.mjs", import.meta.url).href);

test("formatDuration formats millisecond, second, and minute durations", () => {
  assert.equal(formatDuration(250), "250ms");
  assert.equal(formatDuration(1500), "1.5s");
  assert.equal(formatDuration(65_000), "1m 5s");
});

test("formatToolInput renders tool-specific summaries", () => {
  assert.equal(formatToolInput({ path: "src/index.ts", offset: 3, limit: 4 }, "read_file"), "src/index.ts lines 3-6");
  assert.equal(formatToolInput({ pattern: "TODO", path: "src" }, "grep"), '"TODO" in src');
  assert.equal(formatToolInput({ sourcePath: "a.ts", targetPath: "b.ts" }, "move_file"), "a.ts → b.ts");
});

test("formatToolOutput renders common tool results", () => {
  assert.equal(formatToolOutput({ entries: [], count: 0 }, "list_file"), "Empty directory");
  assert.equal(formatToolOutput({ files: ["a.ts", "b.ts"], count: 2 }, "glob"), "2 files found:\n  a.ts\n  b.ts");
  assert.equal(formatToolOutput({ matches: [], count: 0, contentTruncated: false }, "grep"), "No matches found");
});

test("formatToolArgs renders compact multi-line arguments", () => {
  assert.equal(formatToolArgs(null), "No arguments");
  assert.equal(formatToolArgs({ path: "src/index.ts", limit: 10 }), "  path: src/index.ts\n  limit: 10");
});

test("tool display helpers handle duration and state colors", () => {
  assert.equal(getDurationMs({ durationMs: 1200 }), 1200);
  assert.equal(getDurationMs({ durationMs: "1200" }), null);
  assert.equal(getToolCallColor("output-available"), "green");
  assert.equal(getToolCallColor("unknown"), "gray");
});
