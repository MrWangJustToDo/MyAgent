/**
 * Validates tool activity summary helpers.
 *
 * Run: node packages/app/test/tool-activity-summary.test.mjs
 */
import assert from "node:assert/strict";

import {
  countToolActivity,
  extractActivityLabel,
  extractActivityLabelInfo,
  formatExploredActivitySummary,
  formatToolActivitySummary,
  getToolActivityBucket,
  shouldFoldToolRow,
  shouldKeepToolRow,
  summarizeToolActivity,
} from "../dist/utils/tool-activity-summary.mjs";

assert.equal(getToolActivityBucket("read_file"), "reads");
assert.equal(getToolActivityBucket("list_file"), "reads");
assert.equal(getToolActivityBucket("tree"), "reads");
assert.equal(getToolActivityBucket("edit_file"), "edits");
assert.equal(getToolActivityBucket("write_file"), "edits");
assert.equal(getToolActivityBucket("delete_file"), "edits");
assert.equal(getToolActivityBucket("grep"), "searches");
assert.equal(getToolActivityBucket("glob"), "searches");
assert.equal(getToolActivityBucket("websearch"), "searches");
assert.equal(getToolActivityBucket("webfetch"), "searches");
assert.equal(getToolActivityBucket("run_command"), "commands");
assert.equal(getToolActivityBucket("task"), "tasks");
assert.equal(getToolActivityBucket("todo"), "other");

// Completed tools (incl. edit_file) fold; only lifecycle states keep rows.
assert.equal(
  shouldKeepToolRow({ id: "1", name: "edit_file", type: "tool-call", state: "complete", output: {} }),
  false
);
assert.equal(shouldFoldToolRow({ id: "2", name: "read_file", type: "tool-call", state: "complete", output: {} }), true);
assert.equal(shouldKeepToolRow({ id: "3", name: "read_file", type: "tool-call", state: "input-complete" }), true);
assert.equal(
  shouldKeepToolRow({ id: "4", name: "read_file", type: "tool-call", state: "error", output: { error: "x" } }),
  false
);
// Errored rows fold too (counted as errors), not kept as standalone rows.
assert.equal(
  shouldFoldToolRow({ id: "5", name: "read_file", type: "tool-call", state: "error", output: { error: "x" } }),
  true
);

const parts = [
  { id: "1", name: "read_file", type: "tool-call" },
  { id: "2", name: "read_file", type: "tool-call" },
  { id: "3", name: "edit_file", type: "tool-call" },
  { id: "1", name: "read_file", type: "tool-call" }, // dedupe
  { id: "4", name: "grep", type: "tool-call" },
];

const counts = countToolActivity(parts);
assert.deepEqual(counts, {
  reads: 2,
  edits: 1,
  searches: 1,
  commands: 0,
  tasks: 0,
  other: 0,
  errors: 0,
});

assert.equal(formatToolActivitySummary(counts), "2 reads, 1 edit, 1 search");
assert.equal(
  formatToolActivitySummary({ reads: 1, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0, errors: 0 }),
  "1 read"
);
assert.equal(
  formatToolActivitySummary({ reads: 0, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0, errors: 0 }),
  null
);
assert.equal(summarizeToolActivity([]), null);
assert.equal(summarizeToolActivity(parts), "2 reads, 1 edit, 1 search");

// Errored rows count as errors only (not double-counted in their own bucket).
const withErrors = countToolActivity([
  { id: "e1", name: "read_file", type: "tool-call", state: "error", output: { error: "boom" } },
  { id: "e2", name: "edit_file", type: "tool-call", state: "error", output: { error: "nope" } },
]);
assert.deepEqual(withErrors, {
  reads: 0,
  edits: 0,
  searches: 0,
  commands: 0,
  tasks: 0,
  other: 0,
  errors: 2,
});
assert.equal(formatToolActivitySummary(withErrors), "2 errors");

assert.equal(
  extractActivityLabel({
    id: "x",
    name: "read_file",
    type: "tool-call",
    arguments: JSON.stringify({ path: "packages/app/src/foo.ts" }),
  }),
  "foo.ts"
);

// Label tiers: file basenames outrank directory basenames.
assert.equal(
  extractActivityLabelInfo({
    id: "x",
    name: "read_file",
    type: "tool-call",
    arguments: JSON.stringify({ path: "packages/app/src/foo.ts" }),
  }).tier,
  0
);
assert.equal(
  extractActivityLabelInfo({
    id: "x",
    name: "tree",
    type: "tool-call",
    arguments: JSON.stringify({ path: "packages/app" }),
  }).tier,
  2
);
assert.equal(
  extractActivityLabelInfo({
    id: "x",
    name: "grep",
    type: "tool-call",
    arguments: JSON.stringify({ pattern: "compact", path: "packages/app/src" }),
  }).tier,
  1
);

assert.equal(
  formatExploredActivitySummary([
    {
      id: "1",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "a.ts" }),
      output: { durationMs: 300 },
    },
    {
      id: "2",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "b.ts" }),
      output: { durationMs: 700 },
    },
    {
      id: "3",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "c.ts" }),
      output: { durationMs: 500 },
    },
  ]),
  "Explored 3 files · a.ts, b.ts, +1 · 1.5s"
);

// Directory labels (tree) must not crowd out file labels.
assert.equal(
  formatExploredActivitySummary([
    {
      id: "1",
      name: "tree",
      type: "tool-call",
      arguments: JSON.stringify({ path: "packages/app" }),
      output: { durationMs: 10 },
    },
    {
      id: "2",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "src/a.ts" }),
      output: { durationMs: 20 },
    },
    {
      id: "3",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "src/b.ts" }),
      output: { durationMs: 20 },
    },
  ]),
  "Explored 3 files · a.ts, b.ts, +1"
);

// Errored rows surface in the summary count with labels.
assert.equal(
  formatExploredActivitySummary([
    {
      id: "1",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "a.ts" }),
      output: { durationMs: 400 },
    },
    {
      id: "2",
      name: "read_file",
      type: "tool-call",
      state: "error",
      arguments: JSON.stringify({ path: "b.ts" }),
      output: { error: "boom", durationMs: 600 },
    },
  ]),
  "1 read, 1 error · a.ts, b.ts · 1.0s"
);

// Duration below threshold is not shown.
assert.equal(
  formatExploredActivitySummary([
    {
      id: "1",
      name: "read_file",
      type: "tool-call",
      arguments: JSON.stringify({ path: "a.ts" }),
      output: { durationMs: 10 },
    },
  ]),
  "Explored 1 file · a.ts"
);

console.log("tool-activity-summary.test.mjs: ok");
