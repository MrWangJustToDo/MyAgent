/**
 * Validates compact transcript projection.
 *
 * Run: node packages/app/test/project-transcript.test.mjs
 */
import assert from "node:assert/strict";

import {
  ACTIVITY_SUMMARY_ID_PREFIX,
  isActivitySummaryMessage,
  projectTranscriptForDisplay,
} from "../dist/utils/project-transcript.mjs";

function textMsg(id, role, content) {
  return { id, role, parts: [{ type: "text", content }] };
}

function toolMsg(id, tools) {
  return {
    id,
    role: "assistant",
    parts: tools.map((t) => ({
      type: "tool-call",
      id: t.id,
      name: t.name,
      state: t.state ?? "complete",
      arguments: t.arguments ?? "{}",
      output: t.output,
      approval: t.approval,
    })),
  };
}

const user = textMsg("u1", "user", "fix the bug");
const tools = toolMsg("a1", [
  { id: "t1", name: "read_file", arguments: JSON.stringify({ path: "src/a.ts" }), output: {} },
  { id: "t2", name: "edit_file", arguments: JSON.stringify({ path: "src/a.ts" }), output: {} },
]);
const final = textMsg("a2", "assistant", "Done.");

// Below fold threshold (1 read): keep original messages — density mode, no projection.
const below = projectTranscriptForDisplay([user, tools, final], { mode: "compact" });
assert.equal(below.length, 3);
assert.equal(below[1].id, "a1");
assert.ok(!below.some(isActivitySummaryMessage));

// 3+ consecutive completed reads fold into a path-aware summary.
const manyReads = projectTranscriptForDisplay(
  [
    user,
    toolMsg("a1", [
      { id: "r1", name: "read_file", arguments: JSON.stringify({ path: "src/a.ts" }), output: {} },
      { id: "r2", name: "read_file", arguments: JSON.stringify({ path: "src/b.ts" }), output: {} },
      { id: "r3", name: "read_file", arguments: JSON.stringify({ path: "src/c.ts" }), output: {} },
      { id: "e1", name: "edit_file", arguments: JSON.stringify({ path: "src/a.ts" }), output: {} },
    ]),
    final,
  ],
  { mode: "compact" }
);
assert.equal(manyReads[0].id, "u1");
assert.ok(isActivitySummaryMessage(manyReads[1]));
assert.ok(manyReads[1].id.startsWith(`${ACTIVITY_SUMMARY_ID_PREFIX}u1`));
assert.equal(manyReads[1].parts[0].content, "Explored 3 files · a.ts, b.ts, +1");
assert.equal(manyReads[2].parts[0].name, "edit_file");
assert.equal(manyReads[3].parts[0].content, "Done.");

// In-progress read after 3 completed: fold completed, keep executing.
const liveExec = projectTranscriptForDisplay(
  [
    user,
    toolMsg("a1", [
      { id: "t1", name: "read_file", arguments: JSON.stringify({ path: "a.ts" }), output: {} },
      { id: "t2", name: "read_file", arguments: JSON.stringify({ path: "b.ts" }), output: {} },
      { id: "t3", name: "read_file", arguments: JSON.stringify({ path: "c.ts" }), output: {} },
      { id: "t4", name: "read_file", state: "input-complete", arguments: JSON.stringify({ path: "d.ts" }) },
    ]),
  ],
  { mode: "compact" }
);
assert.ok(isActivitySummaryMessage(liveExec[1]));
assert.match(liveExec[1].parts[0].content, /^Explored 3 files/);
assert.equal(liveExec[2].parts[0].id, "t4");

const full = projectTranscriptForDisplay([user, tools, final], { mode: "full" });
assert.equal(full.length, 3);
assert.equal(full[1].id, "a1");

// Pending approval stays as a real tool row.
const pending = projectTranscriptForDisplay(
  [
    user,
    toolMsg("a1", [
      {
        id: "t1",
        name: "edit_file",
        state: "approval-requested",
        approval: { id: "ap1", needsApproval: true },
      },
    ]),
  ],
  { mode: "compact" }
);
assert.equal(pending[1].parts[0].id, "t1");
assert.ok(!isActivitySummaryMessage(pending[1]));

// Esc / abort with only 1 completed read: below threshold → originals (incomplete kept via tool state).
const aborted = projectTranscriptForDisplay(
  [
    user,
    toolMsg("a1", [
      { id: "t1", name: "read_file", output: {} },
      { id: "t2", name: "read_file", state: "input-complete" },
    ]),
  ],
  { mode: "compact" }
);
assert.equal(aborted[1].id, "a1");
assert.ok(!aborted.some(isActivitySummaryMessage));

// Error on foldable tool interrupts fold; 3 completed reads before error still fold.
const errored = projectTranscriptForDisplay(
  [
    user,
    toolMsg("a1", [
      { id: "t1", name: "read_file", arguments: JSON.stringify({ path: "a.ts" }), output: {} },
      { id: "t2", name: "read_file", arguments: JSON.stringify({ path: "b.ts" }), output: {} },
      { id: "t3", name: "read_file", arguments: JSON.stringify({ path: "c.ts" }), output: {} },
      { id: "t4", name: "read_file", state: "error", output: { error: "boom" } },
    ]),
  ],
  { mode: "compact" }
);
assert.ok(isActivitySummaryMessage(errored[1]));
assert.equal(errored[2].parts[0].id, "t4");

const noTools = projectTranscriptForDisplay([user, final], { mode: "compact" });
assert.equal(noTools.length, 2);
assert.ok(!noTools.some(isActivitySummaryMessage));

// Intermediate text + below-threshold explores: no fold, originals kept.
const withMidText = projectTranscriptForDisplay(
  [
    user,
    textMsg("a0", "assistant", "Looking around…"),
    toolMsg("a1", [
      { id: "t1", name: "read_file", output: {} },
      { id: "t2", name: "edit_file", output: {} },
    ]),
    textMsg("a2", "assistant", "Done."),
  ],
  { mode: "compact" }
);
assert.equal(withMidText[1].id, "a0");
assert.equal(withMidText[2].id, "a1");
assert.ok(!withMidText.some(isActivitySummaryMessage));

// Sparse parts: single read below threshold → no fold.
const sparse = projectTranscriptForDisplay(
  [
    user,
    {
      id: "a-sparse",
      role: "assistant",
      parts: [
        undefined,
        { type: "tool-call", id: "t1", name: "read_file", state: "complete", arguments: "{}", output: {} },
        null,
      ],
    },
    final,
  ],
  { mode: "compact" }
);
assert.equal(sparse[1].id, "a-sparse");
assert.ok(!sparse.some(isActivitySummaryMessage));

console.log("project-transcript.test.mjs: ok");
