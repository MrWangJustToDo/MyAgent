/**
 * Validates agent status helpers and ManagedAgent lifecycle ownership.
 *
 * Run: pnpm --filter @codent/core run validate:agent-status
 */

import assert from "node:assert/strict";

import {
  ACTIVE_STATUSES,
  createAgentStatusController,
  isActiveStatus,
  isTerminalStatus,
  ManagedAgent,
  resolveFinishStatus,
} from "../dist/dev.mjs";

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

assert.equal(managed.status, "idle");
managed.setStatus("running");
assert.equal(managed.status, "running");

managed.setClientToolWaiting(true);
assert.equal(managed.status, "awaiting_user");
managed.setClientToolWaiting(false);
assert.equal(managed.status, "completed");

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
assert.equal(managed.status, "completed");

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
assert.equal(managed.status, "waiting");

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

console.log("agent-status validation passed");
