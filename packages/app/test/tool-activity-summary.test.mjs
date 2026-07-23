/**
 * Validates tool activity summary helpers.
 *
 * Run: node packages/app/test/tool-activity-summary.test.mjs
 */
import assert from "node:assert/strict";

import {
  countToolActivity,
  formatToolActivitySummary,
  getToolActivityBucket,
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
});

assert.equal(formatToolActivitySummary(counts), "2 reads, 1 edit, 1 search");
assert.equal(formatToolActivitySummary({ reads: 1, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0 }), "1 read");
assert.equal(formatToolActivitySummary({ reads: 0, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0 }), null);
assert.equal(summarizeToolActivity([]), null);
assert.equal(summarizeToolActivity(parts), "2 reads, 1 edit, 1 search");

console.log("tool-activity-summary.test.mjs: ok");
