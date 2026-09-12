/**
 * Validates run-abort ownership invariants (change: unify-run-abort-ownership):
 *
 * 1. RunToken lifecycle — beginRun supersedes the previous token; interrupt
 *    invalidation flips `isCurrent`; finalize-once gating relies on it.
 * 2. AgentRunner.resolveAbortController — managed paths must pass the
 *    coordinator-owned controller (historical "double AbortController" guard);
 *    detached opt-in creates a fresh controller linked to the given signal.
 * 3. Parent → child cascade — ManagedAgent.abort() aborts running child
 *    subagents via cascadeAbortToChildren (serial `task` path regression lock).
 *
 * Run: pnpm --filter @my-agent/core run validate:run-abort-ownership
 */

import assert from "node:assert/strict";

import { AgentRunner, AgentUIChannel, ManagedAgent, RunCoordinator } from "../dist/dev.mjs";

// ---------------------------------------------------------------------------
// 1. RunToken lifecycle
// ---------------------------------------------------------------------------

{
  const run = new RunCoordinator();

  const tokenA = run.beginRun();
  assert.equal(tokenA.isCurrent, true, "fresh token is current");
  assert.ok(tokenA.id > 0);

  // Supersede: a new run invalidates the previous token.
  const tokenB = run.beginRun();
  assert.equal(tokenA.isCurrent, false, "superseded token is stale");
  assert.equal(tokenB.isCurrent, true);
  assert.notEqual(tokenB.id, tokenA.id);

  // Interrupt: explicit invalidation without starting a new run.
  run.invalidateCurrentRun();
  assert.equal(tokenB.isCurrent, false, "interrupt invalidates the current token");
  assert.equal(run.isCurrentRunValid(), false);

  // A subsequent run is fresh again.
  const tokenC = run.beginRun();
  assert.equal(tokenC.isCurrent, true);
  assert.equal(run.isCurrentRunValid(), true);
}

// ---------------------------------------------------------------------------
// 2. AgentRunner controller ownership
// ---------------------------------------------------------------------------

{
  const owner = new AbortController();

  // Managed path: the passed controller identity is used as-is.
  assert.equal(AgentRunner.resolveAbortController({ abortController: owner }), owner);

  // Managed path without a controller is rejected — this is the historical
  // "double AbortController" bug shape (cancel fired one controller while
  // chat() listened to another).
  assert.throws(
    () => AgentRunner.resolveAbortController({}),
    /single creation point|AbortController/,
    "managed run without an owner controller must be rejected"
  );
  assert.throws(
    () => AgentRunner.resolveAbortController({ abortSignal: owner.signal }),
    /single creation point|AbortController/,
    "abortSignal alone is not an owner controller"
  );

  // Ad-hoc path: explicit detached opt-in creates a fresh controller that
  // follows the external signal.
  const signal = new AbortController().signal;
  const detached = AgentRunner.resolveAbortController({ abortSignal: signal, detached: true });
  assert.notEqual(detached, owner);
  assert.equal(detached.signal.aborted, false);

  // Detached controller follows an abort of the external signal.
  const external = new AbortController();
  const linked = AgentRunner.resolveAbortController({ abortSignal: external.signal, detached: true });
  external.abort("external-cancel");
  assert.equal(linked.signal.aborted, true, "detached controller follows external signal");

  // Pre-aborted external signal aborts immediately.
  const preAborted = new AbortController();
  preAborted.abort("early");
  const follow = AgentRunner.resolveAbortController({ abortSignal: preAborted.signal, detached: true });
  assert.equal(follow.signal.aborted, true);
}

// ---------------------------------------------------------------------------
// 3. AgentRunner.run guard (end-to-end: run() itself must not silently detach)
// ---------------------------------------------------------------------------

{
  const runner = new AgentRunner({
    adapter: {
      kind: "text",
      name: "fake",
      model: "fake-model",
      "~types": {},
      chatStream() {
        return (async function* () {})();
      },
      async structuredOutput() {
        throw new Error("not implemented");
      },
    },
    model: "fake-model",
  });

  // run() is a generator: resolveAbortController throws on first pull.
  assert.throws(
    () => runner.run({ agentId: "a1" }).next(),
    /single creation point|AbortController/,
    "run() without a controller must be rejected"
  );
}

// ---------------------------------------------------------------------------
// 4. Parent → child cascade (serial `task` regression lock)
// ---------------------------------------------------------------------------

function createManaged(id) {
  const managed = new ManagedAgent(
    { name: id, model: "gpt-4" },
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
  managed.setUIChannel(new AgentUIChannel());
  return managed;
}

{
  const parent = createManaged("parent");
  const child = createManaged("child");

  // Minimal manager facade: only what cascadeAbortToChildren needs.
  parent.manager = { getAgent: (id) => (id === child.id ? child : undefined) };
  parent.childIds.push(child.id);

  // Abort cascade only touches actively running children.
  child.setStatus("running");
  let childAborted = 0;
  const realChildAbort = child.abort.bind(child);
  child.abort = (reason) => {
    childAborted += 1;
    realChildAbort(reason);
  };

  parent.abort("user-cancelled");
  assert.equal(childAborted, 1, "running child is aborted exactly once by parent abort");
  assert.equal(child.status, "aborted", "child settles in aborted terminal state");
  // Parent without an active run stays idle by design (status gate in abortManagedAgentRun).

  // Idle children are untouched.
  const idle = createManaged("idle-child");
  parent.childIds.push(idle.id);
  idle.setStatus("idle");
  parent.abort("user-cancelled-2");
  assert.equal(idle.status, "idle", "idle child must not be aborted");
}

console.log("run-abort-ownership validation passed");
