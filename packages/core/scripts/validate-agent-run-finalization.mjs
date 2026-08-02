/**
 * Validates shared applyRunOutcome for chat vs detached paths, including
 * approval-count sync and idempotent error handling.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-run-finalization
 */

import assert from "node:assert/strict";

import { createAgentStatusController, whenClearForReconcilePolicy } from "../dist/dev.mjs";

function makeController(initial = "running") {
  let current = initial;
  let error = "";
  let pendingApprovalCount = -1;
  const events = [];
  const status = createAgentStatusController({
    getStatus: () => current,
    setStatus: (next) => {
      current = next;
    },
    getError: () => error,
    setError: (message) => {
      error = message;
    },
    setPendingApprovalCount: (count) => {
      pendingApprovalCount = count;
    },
    emitEvent: (type, data) => {
      events.push({ type, data });
    },
  });
  return {
    status,
    events,
    get current() {
      return current;
    },
    set current(next) {
      current = next;
    },
    get error() {
      return error;
    },
    set error(next) {
      error = next;
    },
    get pendingApprovalCount() {
      return pendingApprovalCount;
    },
  };
}

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

const waitingMessages = [
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
];

const askUserMessages = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", content: "ask" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_ask",
        name: "ask_user",
        arguments: '{"question":"ok?"}',
        state: "input-complete",
      },
    ],
  },
];

assert.equal(whenClearForReconcilePolicy("during-run"), "running");
assert.equal(whenClearForReconcilePolicy("after-chat-run"), "completed");
assert.equal(whenClearForReconcilePolicy("idle-clear"), "idle");

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "finished", messages: doneMessages, path: "chat" });
  assert.equal(ctrl.current, "completed");
  assert.equal(ctrl.pendingApprovalCount, 0);
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "finished", messages: waitingMessages, path: "chat" });
  assert.equal(ctrl.current, "waiting", "chat finished must preserve approval wait");
  assert.equal(ctrl.pendingApprovalCount, 1);
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "waiting", messages: waitingMessages, path: "chat" });
  assert.equal(ctrl.current, "waiting");
  assert.equal(ctrl.pendingApprovalCount, 1);
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "waiting", messages: askUserMessages, path: "chat" });
  assert.equal(ctrl.current, "awaiting_user");
  assert.equal(ctrl.pendingApprovalCount, 0);
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "finished", messages: doneMessages, path: "detached" });
  assert.equal(ctrl.current, "completed");
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "finished", messages: waitingMessages, path: "detached" });
  assert.equal(ctrl.current, "completed", "detached finished must not linger waiting");
  assert.equal(ctrl.pendingApprovalCount, 1, "approval count still reflects messages");
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({ kind: "aborted", messages: waitingMessages, path: "detached" });
  assert.equal(ctrl.current, "aborted");
  assert.equal(ctrl.pendingApprovalCount, 1, "abort still syncs approval count");
}

{
  const ctrl = makeController();
  ctrl.status.applyRunOutcome({
    kind: "error",
    messages: waitingMessages,
    path: "chat",
    errorMessage: "boom",
  });
  assert.equal(ctrl.current, "error");
  assert.equal(ctrl.error, "boom");
  assert.equal(ctrl.pendingApprovalCount, 1);
  assert.equal(ctrl.events.filter((e) => e.type === "agent:stream-error").length, 1);
}

{
  // Idempotent: already in error from executeStream — do not re-emit stream-error.
  const ctrl = makeController("error");
  ctrl.error = "boom";
  ctrl.status.applyRunOutcome({
    kind: "error",
    messages: doneMessages,
    path: "chat",
    errorMessage: "boom",
  });
  assert.equal(ctrl.current, "error");
  assert.equal(ctrl.error, "boom");
  assert.equal(ctrl.events.length, 0, "must not re-emit agent:stream-error");
  assert.equal(ctrl.pendingApprovalCount, 0);
}

{
  const ctrl = makeController();
  ctrl.current = "waiting";
  ctrl.status.reconcileWithPolicy(doneMessages, "during-run");
  assert.equal(ctrl.current, "running");
}

{
  // Mid-pump: approval clears → during-run restores running, not completed.
  const ctrl = makeController("waiting");
  ctrl.status.reconcileWithPolicy(doneMessages, "during-run");
  assert.equal(ctrl.current, "running");
}

{
  const ctrl = makeController("waiting");
  ctrl.status.reconcileWithPolicy(doneMessages, "after-chat-run");
  assert.equal(ctrl.current, "completed");
}

{
  // Sticky abort: leftover text chunks must not resurrect running.
  const ctrl = makeController("aborted");
  ctrl.status.onStreamChunk({
    type: "TEXT_MESSAGE_CONTENT",
    messageId: "m1",
    content: "x",
    delta: "x",
  });
  assert.equal(ctrl.current, "aborted");
}

console.log("agent-run-finalization validation passed");
