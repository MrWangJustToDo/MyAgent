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
      arguments: "{}",
      output: t.output,
      approval: t.approval,
    })),
  };
}

const user = textMsg("u1", "user", "fix the bug");
const tools = toolMsg("a1", [
  { id: "t1", name: "read_file", output: {} },
  { id: "t2", name: "edit_file", output: {} },
]);
const final = textMsg("a2", "assistant", "Done.");

const collapsed = projectTranscriptForDisplay([user, tools, final], { mode: "compact", isLoading: false });
assert.equal(collapsed.length, 3);
assert.equal(collapsed[0].id, "u1");
assert.ok(isActivitySummaryMessage(collapsed[1]));
assert.equal(collapsed[1].id, `${ACTIVITY_SUMMARY_ID_PREFIX}u1`);
assert.equal(collapsed[1].parts[0].content, "1 read, 1 edit");
assert.equal(collapsed[2].parts[0].content, "Done.");

const live = projectTranscriptForDisplay([user, tools, final], { mode: "compact", isLoading: true });
assert.equal(live.length, 3);
assert.equal(live[1].id, "a1");
assert.ok(!isActivitySummaryMessage(live[1]));

const full = projectTranscriptForDisplay([user, tools, final], { mode: "full", isLoading: false });
assert.equal(full.length, 3);
assert.equal(full[1].id, "a1");

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
  { mode: "compact", isLoading: false }
);
assert.equal(pending.length, 2);
assert.equal(pending[1].id, "a1");
assert.ok(!isActivitySummaryMessage(pending[1]));

const noTools = projectTranscriptForDisplay([user, final], { mode: "compact", isLoading: false });
assert.equal(noTools.length, 2);
assert.ok(!noTools.some(isActivitySummaryMessage));

// Sparse parts arrays (holes / undefined) must not throw in compact projection.
const sparse = projectTranscriptForDisplay(
  [
    user,
    {
      id: "a-sparse",
      role: "assistant",
      parts: [
        undefined,
        { type: "tool-call", id: "t1", name: "read_file", state: "complete", arguments: "{}", output: {} },
        ,
        null,
      ],
    },
    final,
  ],
  { mode: "compact", isLoading: false }
);
assert.equal(sparse.length, 3);
assert.ok(isActivitySummaryMessage(sparse[1]));
assert.equal(sparse[1].parts[0].content, "1 read");

console.log("project-transcript.test.mjs: ok");
