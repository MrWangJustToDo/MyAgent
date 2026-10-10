/**
 * Validates agent status helpers and ManagedAgent lifecycle ownership.
 *
 * Run: pnpm --filter @codent/core run validate:agent-status
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_STATUSES,
  createAgentStatusController,
  isActiveStatus,
  isTerminalStatus,
  ManagedAgent,
  resolveFinishStatus,
} from "../dist/dev.mjs";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

assert.equal(isTerminalStatus("aborted"), true);
assert.equal(isTerminalStatus("waiting"), true);
assert.equal(isTerminalStatus("running"), false);

assert.equal(isActiveStatus("thinking"), true);
assert.equal(isActiveStatus("completed"), false);
assert.equal(ACTIVE_STATUSES.has("compacting"), true);

assert.equal(resolveFinishStatus("aborted", ""), "aborted");
assert.equal(resolveFinishStatus("waiting", "oops"), "waiting");
assert.equal(resolveFinishStatus("awaiting_user", ""), "awaiting_user");
assert.equal(resolveFinishStatus("running", "failed"), "error");
assert.equal(resolveFinishStatus("responding", ""), "completed");

const managed = new ManagedAgent(
  { name: "test", model: "gpt-4" },
  {
    context: {
      getMessages: () => [],
      getUIMessages: () => [],
      reset: () => {},
      setMessages: () => {},
      setUIMessages: () => {},
      getMessagesForLLM: () => [],
    },
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, agent: () => {}, clear: () => {} },
    tools: {},
    todoManager: null,
  }
);

assert.equal(managed.getStatus(), "idle");
managed.setStatus("running");
assert.equal(managed.getStatus(), "running");

managed.setClientToolWaiting(true);
assert.equal(managed.getStatus(), "awaiting_user");
managed.setClientToolWaiting(false);
assert.equal(managed.getStatus(), "completed");

// Regression: while already awaiting_user, a repeated setClientToolWaiting(true)
// must be a no-op (no setStatus → no re-emit). The app re-dispatches whenever a
// fresh interaction snapshot changes the pending ask_user object reference; an
// unguarded re-emit here fed an infinite app↔core loop.
{
  let setStatusCalls = 0;
  const controller = createAgentStatusController({
    getStatus: () => "awaiting_user",
    setStatus: () => {
      setStatusCalls++;
    },
    getError: () => "",
    setError: () => {},
    setPendingApprovalCount: () => {},
    emitEvent: () => {},
  });
  controller.setClientToolWaiting(true);
  assert.equal(setStatusCalls, 0);
  controller.setClientToolWaiting(false);
  assert.equal(setStatusCalls, 1); // false path still transitions awaiting_user → completed
}

managed.setStatus("running");
managed.syncRunStatusFromUIMessages([
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", content: "hi" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", content: "hello" }],
  },
]);
assert.equal(managed.getStatus(), "completed");

managed.setStatus("running");
managed.syncRunStatusFromUIMessages([
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", content: "run" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_cmd",
        name: "run_command",
        arguments: '{"command":"echo hi"}',
        state: "input-complete",
        approval: { needsApproval: true, approved: undefined },
      },
    ],
  },
]);
assert.equal(managed.getStatus(), "waiting");

{
  let current = "aborted";
  const status = createAgentStatusController({
    getStatus: () => current,
    setStatus: (next) => {
      current = next;
    },
    getError: () => "",
    setError: () => {},
    setPendingApprovalCount: () => {},
  });
  status.onRunStart();
  assert.equal(current, "aborted");
  status.onStreamChunk({ type: "TOOL_CALL_START", toolCallId: "t1", toolName: "read_file" });
  assert.equal(current, "aborted");
  status.onStreamChunk({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", content: "x", delta: "x" });
  assert.equal(current, "aborted");
}

{
  // Chunk-driven transitions must only fire on a real change. A run streams
  // hundreds of reasoning/text chunks in a row; re-setting the status they
  // already imply is not a transition (`setStatus` logs only real transitions but
  // re-emits the state/mode/interaction projections on every call).
  let current = "running";
  const setCalls = [];
  const status = createAgentStatusController({
    getStatus: () => current,
    setStatus: (next) => {
      current = next;
      setCalls.push(next);
    },
    getError: () => "",
    setError: () => {},
    setPendingApprovalCount: () => {},
  });

  const reasoning = (i) => ({ type: "REASONING_MESSAGE_CONTENT", messageId: "m1", content: `t${i}`, delta: `t${i}` });

  // First reasoning chunk: running → thinking (a real transition).
  status.onStreamChunk(reasoning(0));
  assert.equal(current, "thinking");
  assert.deepEqual(setCalls, ["thinking"]);

  // The rest of the reasoning stream is the same status — no setStatus at all.
  for (let i = 1; i < 200; i++) status.onStreamChunk(reasoning(i));
  assert.deepEqual(setCalls, ["thinking"], "repeated reasoning chunks must not re-set status");

  // Text after reasoning: thinking → responding (a real transition), then silent.
  const text = (i) => ({ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", content: `x${i}`, delta: `x${i}` });
  status.onStreamChunk(text(0));
  assert.equal(current, "responding");
  for (let i = 1; i < 200; i++) status.onStreamChunk(text(i));
  assert.deepEqual(setCalls, ["thinking", "responding"], "repeated text chunks must not re-set status");

  // A tool call still moves responding → running, then stays put on repeats.
  const tool = () => ({ type: "TOOL_CALL_START", toolCallId: "t1", toolName: "read_file" });
  status.onStreamChunk(tool());
  assert.equal(current, "running");
  for (let i = 0; i < 50; i++) status.onStreamChunk(tool());
  assert.deepEqual(setCalls, ["thinking", "responding", "running"], "repeated tool chunks must not re-set status");
}

{
  let current = "running";
  const status = createAgentStatusController({
    getStatus: () => current,
    setStatus: (next) => {
      current = next;
    },
    getError: () => "",
    setError: () => {},
    setPendingApprovalCount: () => {},
  });
  const doneMessages = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", content: "explore" }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", content: "done" }],
    },
  ];
  status.applyRunOutcome({ kind: "finished", messages: doneMessages, path: "detached" });
  assert.equal(current, "completed", "detached subagent run must leave completed, not running");

  current = "running";
  status.applyRunOutcome({ kind: "aborted", messages: doneMessages, path: "detached" });
  assert.equal(current, "aborted");
}

// --- the abort listener must not rewrite a terminal status ---
//
// Regression: `onAborted` set `aborted` unconditionally, and it fires SYNCHRONOUSLY inside
// `RunCoordinator.abort()` — so the `status !== "completed"` check that follows in
// `abortManagedAgentRun` always observed an already-rewritten status and was dead code. Every
// destroy of a finished agent logged `completed → aborted`, so the session's final status
// contradicted `resolveFinishStatus` and the task panel rendered completed delegations as
// cancelled. Asserted at the source because the bug was the *placement* of the guard (before
// vs after a synchronous call), which no value assertion of the pure helper can see.
{
  const src = readFileSync(join(SRC, "managers/managed-agent-run-lifecycle.ts"), "utf8");
  const listener = /onAborted: \(\) => \{([\s\S]*?)\n {6}\}/.exec(src);
  assert.ok(listener, "the abort listener is present");
  const body = listener[1];
  assert.ok(
    /isTerminalStatus\(host\.getStatus\(\)\)/.test(body),
    "the listener guards on the terminal table — an already-finished agent keeps its status"
  );
  // The guard must precede the setStatus in the SAME body: a check performed after the write
  // is the dead-code shape this replaced.
  assert.ok(
    body.indexOf("isTerminalStatus") < body.indexOf('setStatus("aborted")'),
    "the guard must be read BEFORE the status is written (the write is unconditional otherwise)"
  );
  // And no unguarded `setStatus("aborted")` may survive in this module's abort paths.
  for (const match of src.matchAll(/setStatus\("aborted"\)/g)) {
    const before = src.slice(Math.max(0, match.index - 400), match.index);
    const chained = before.lastIndexOf("abortManagedAgentRun(");
    const enclosing = chained >= 0 ? before.slice(chained) : before;
    assert.ok(
      /isTerminalStatus/.test(enclosing) || /status !== "aborted"/.test(enclosing),
      'every `setStatus("aborted")` in the run-lifecycle module is behind a terminal guard'
    );
  }
}

console.log("agent-status validation passed");
