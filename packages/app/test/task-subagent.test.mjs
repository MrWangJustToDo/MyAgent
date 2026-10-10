/**
 * Validates which subagent row a `task` tool call renders.
 *
 * This is the read-side half of the orphan defence. The producer-side cause (a pre-fork
 * aborted at a model-iteration boundary, then a second subagent spawned for the same call
 * id) is fixed in core, but "the first row bound to this call id" was a trap that outlived
 * it: `snapshot.subagents` is spawn-ordered, so an orphan always precedes the run that
 * replaced it, and `.find()` returned the dead attempt. A task row could then show
 * status `aborted` — the reading the whole investigation started from — while the real run
 * streamed on.
 *
 * Run: node --test test/task-subagent.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

// The module graph reaches CoreEnv-independent code, so register a stub as the other app
// tests do.
const { registerCoreEnv } = await import(new URL("../../core/dist/index.mjs", import.meta.url).href);
registerCoreEnv({ rootPath: "/repo" });

const { resolveTaskSubagent } = await import("../dist/index.mjs");

/** A snapshot row. `parentTaskToolCallId` present ⇒ user-visible task, absent ⇒ internal worker. */
const row = ({ id, status, taskCallId }) => ({
  id,
  status,
  ...(taskCallId === undefined ? {} : { parentTaskToolCallId: taskCallId }),
});

test("no task id resolves to nothing", () => {
  assert.equal(resolveTaskSubagent([row({ id: "a", status: "running", taskCallId: "t1" })], ""), undefined);
});

test("an unmatched call id resolves to nothing", () => {
  assert.equal(resolveTaskSubagent([row({ id: "a", status: "running", taskCallId: "t1" })], "t2"), undefined);
});

test("internal workers (no task binding) are never resolved", () => {
  // The summarizer is in the snapshot by design; it must not answer for a task call.
  assert.equal(resolveTaskSubagent([row({ id: "worker", status: "compacting" })], "t1"), undefined);
});

test("a single matching row resolves to itself", () => {
  const picked = resolveTaskSubagent([row({ id: "sub", status: "running", taskCallId: "t1" })], "t1");
  assert.equal(picked.id, "sub");
});

test("THE REGRESSION: the orphan precedes the real run, and the live run wins", () => {
  // Spawn order puts the discarded attempt first — the whole reason `.find()` was wrong.
  const rows = [
    row({ id: "subagent-orphan", status: "aborted", taskCallId: "call_01" }),
    row({ id: "subagent-real", status: "running", taskCallId: "call_01" }),
  ];
  const picked = resolveTaskSubagent(rows, "call_01");
  assert.equal(picked.id, "subagent-real", "the run still working is the row the caller asked for");
  assert.equal(picked.status, "running");
});

test("every active status outranks a stopped one", () => {
  for (const status of ["running", "thinking", "responding", "waiting", "awaiting_user", "compacting"]) {
    const picked = resolveTaskSubagent(
      [row({ id: "dead", status: "aborted", taskCallId: "t1" }), row({ id: "live", status, taskCallId: "t1" })],
      "t1"
    );
    assert.equal(picked.id, "live", `a ${status} row beats the aborted attempt`);
  }
});

test("a live orphan still beats an older stopped row — liveness is the first key", () => {
  const picked = resolveTaskSubagent(
    [
      row({ id: "older", status: "completed", taskCallId: "t1" }),
      row({ id: "newer", status: "running", taskCallId: "t1" }),
    ],
    "t1"
  );
  assert.equal(picked.id, "newer");
});

test("among equally-live rows the LATEST wins — the first is the superseded attempt", () => {
  const picked = resolveTaskSubagent(
    [
      row({ id: "attempt-1", status: "running", taskCallId: "t1" }),
      row({ id: "attempt-2", status: "running", taskCallId: "t1" }),
    ],
    "t1"
  );
  assert.equal(picked.id, "attempt-2", "the later spawn is the current run");
});

test("among equally-stopped rows the LATEST still wins", () => {
  const picked = resolveTaskSubagent(
    [
      row({ id: "attempt-1", status: "aborted", taskCallId: "t1" }),
      row({ id: "attempt-2", status: "completed", taskCallId: "t1" }),
    ],
    "t1"
  );
  assert.equal(picked.id, "attempt-2");
});

test("rows bound to other calls are ignored", () => {
  const picked = resolveTaskSubagent(
    [
      row({ id: "other", status: "running", taskCallId: "t2" }),
      row({ id: "mine", status: "completed", taskCallId: "t1" }),
    ],
    "t1"
  );
  assert.equal(picked.id, "mine");
});

test("order does not matter when there is only one candidate", () => {
  const solo = row({ id: "solo", status: "error", taskCallId: "t1" });
  assert.equal(resolveTaskSubagent([solo], "t1").id, "solo");
  assert.equal(resolveTaskSubagent([row({ id: "x", status: "running" }), solo], "t1").id, "solo");
});
