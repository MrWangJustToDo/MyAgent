/**
 * Validates the cancel decision: which subagents a stop targets, and whether the session
 * itself is stopped.
 *
 * This regressed once because the decision was inlined in a React hook with no coverage.
 * The active set was not filtered by task binding, so a running compaction summarizer — which
 * is active and is present in the `subagents` snapshot by design — satisfied "a subagent is
 * active", the subagent-first branch was taken, and the session stop was skipped. The session
 * kept running and restarted compaction on its own; no test noticed.
 *
 * Run: node --test test/stop-decision.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

// The module graph reaches CoreEnv-independent code, so register a stub as the
// other app tests do.
const { registerCoreEnv } = await import(new URL("../../core/dist/index.mjs", import.meta.url).href);
registerCoreEnv({ rootPath: "/repo" });

const { resolveStopDecision } = await import("../dist/index.mjs");

/** A snapshot row; `parentTaskToolCallId` present ⇒ user-visible task, absent ⇒ internal worker. */
const row = ({ id, status, taskCallId }) => ({
  id,
  status,
  ...(taskCallId === undefined ? {} : { parentTaskToolCallId: taskCallId }),
});

// ============================================================================
// Internal workers must not suppress the session stop
// ============================================================================

test("an active internal worker still stops the session", () => {
  // The compaction summarizer runs as `running` (its own status), and carries no task
  // binding. Before the fix this row alone made the session stop a no-op.
  const decision = resolveStopDecision([row({ id: "subagent-compaction", status: "running" })]);

  assert.equal(
    decision.stopSession,
    true,
    "a compaction summarizer must not make the session stop a no-op — that is what made compaction restart on its own"
  );
  assert.deepEqual(decision.taskSubagentIds, [], "an internal worker is not a task to stop first");
});

test("a compacting-status internal worker still stops the session", () => {
  const decision = resolveStopDecision([row({ id: "subagent-compaction", status: "compacting" })]);
  assert.equal(decision.stopSession, true, "the `compacting` status is active and must not hijack the stop");
});

test("several internal workers still stop the session", () => {
  const decision = resolveStopDecision([
    row({ id: "subagent-compaction", status: "running" }),
    row({ id: "subagent-memory", status: "thinking" }),
  ]);
  assert.equal(decision.stopSession, true, "internal workers in any combination must not suppress the stop");
});

test("an idle-only set stops the session", () => {
  const decision = resolveStopDecision([row({ id: "subagent-task", status: "completed", taskCallId: "call_1" })]);
  assert.equal(decision.stopSession, true, "no active task means the session is stopped");
});

test("no subagents at all stops the session", () => {
  assert.equal(resolveStopDecision([]).stopSession, true);
});

// ============================================================================
// Task delegations keep the subagent-first branch
// ============================================================================

test("an active task subagent is stopped first and the session is not stopped", () => {
  const decision = resolveStopDecision([row({ id: "subagent-task", status: "running", taskCallId: "call_1" })]);

  assert.deepEqual(decision.taskSubagentIds, ["subagent-task"], "the task subagent is stopped first");
  assert.equal(
    decision.stopSession,
    false,
    "the parent run must finish the turn so the task's cancellation is readable by the parent model"
  );
});

test("only the task rows are stopped, alongside an internal worker", () => {
  const decision = resolveStopDecision([
    row({ id: "subagent-compaction", status: "running" }),
    row({ id: "subagent-task-a", status: "running", taskCallId: "call_a" }),
    row({ id: "subagent-task-b", status: "thinking", taskCallId: "call_b" }),
  ]);

  assert.deepEqual(
    decision.taskSubagentIds,
    ["subagent-task-a", "subagent-task-b"],
    "internal workers are excluded from the task set"
  );
  assert.equal(decision.stopSession, false, "the task branch is taken when a task is active");
});

test("an empty-string task binding is not a task row", () => {
  // Defensive: the discriminator requires a non-empty binding, not merely a present property.
  const empty = row({ id: "subagent-x", status: "running", taskCallId: "" });
  assert.equal(
    empty.parentTaskToolCallId,
    "",
    "the fixture must actually carry the empty binding — otherwise this test only covers the absent case"
  );

  const decision = resolveStopDecision([empty]);
  assert.equal(decision.stopSession, true, "an empty task binding is not a task delegation");
});

test("a terminal task row does not take the task branch", () => {
  const decision = resolveStopDecision([row({ id: "subagent-task", status: "aborted", taskCallId: "call_1" })]);
  assert.equal(decision.stopSession, true, "a finished task is not stopped again");
  assert.deepEqual(decision.taskSubagentIds, []);
});
