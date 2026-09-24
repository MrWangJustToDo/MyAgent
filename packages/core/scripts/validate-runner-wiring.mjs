/**
 * Validates {@link RunnerWiring} — the runner cache / text adapter / UI channel cluster
 * extracted from `ManagedAgent` (architecture debt P1-15).
 *
 * Three invariants, none of them expressible as a line count:
 *
 * 1. **The runner cache and its key move together.** `invalidateRunner()` must drop
 *    both, because a runner kept under a stale key is a runner built for a tool set
 *    that no longer exists.
 * 2. **Rebinding the UI channel detaches the previous subscription.** `setUIChannel`
 *    is not an assignment: the old channel's approval listener must stop firing, or a
 *    rebind (resume / subagent re-attach) delivers every approval twice. That bug is
 *    silent — two upserts of the same id are indistinguishable from one.
 * 3. **The channel receives the scoped bus.** A channel with no bus never projects
 *    `session:messages`, so a subagent preview created by `ensureUIChannel` would
 *    never surface — again silent.
 *
 * The channel is a duck-typed stub rather than a real `AgentUIChannel`: the approval
 * listener is dispatched from inside the channel's `StreamProcessor`, so driving a real
 * one would test the processor instead of the rebind rule this module owns.
 *
 * Run: pnpm --filter @codent/core run validate:runner-wiring
 */

import assert from "node:assert/strict";

import { RunnerWiring } from "../dist/dev.mjs";

/** Minimal channel: records its approval listeners and the bus it was given. */
function fakeChannel(label) {
  const listeners = new Set();
  return {
    label,
    eventBus: undefined,
    subscribeApprovalRequests(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEventBus(bus) {
      this.eventBus = bus;
    },
    /** Drive one approval request into every listener still subscribed. */
    fire(request) {
      for (const listener of listeners) listener(request);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Runner cache + key move together
// ---------------------------------------------------------------------------
{
  const wiring = new RunnerWiring({ getEventBus: () => undefined, onApprovalRequest: () => {} });

  assert.equal(wiring.getRunner(), undefined, "a fresh wiring has no cached runner");
  assert.equal(wiring.getRunnerConfigKey(), undefined, "a fresh wiring has no key");

  const runner = { marker: "runner" };
  wiring.setRunner(runner);
  wiring.setRunnerConfigKey("key-a");
  assert.equal(wiring.getRunner(), runner);
  assert.equal(wiring.getRunnerConfigKey(), "key-a");

  wiring.invalidateRunner();
  assert.equal(wiring.getRunner(), undefined, "invalidate drops the cached runner");
  assert.equal(
    wiring.getRunnerConfigKey(),
    undefined,
    "invalidate drops the key too — a stale key would re-accept a mismatched runner"
  );

  console.log("runner cache: key and runner invalidate together");
}

// ---------------------------------------------------------------------------
// 2. Rebinding the UI channel detaches the previous approval subscription
// ---------------------------------------------------------------------------
{
  const received = [];
  const wiring = new RunnerWiring({
    getEventBus: () => undefined,
    onApprovalRequest: (request) => received.push(request),
  });

  const first = fakeChannel("first");
  wiring.setUIChannel(first);
  assert.equal(wiring.getUI(), first);
  assert.equal(first.listenerCount, 1, "binding subscribes once");

  first.fire({ approvalId: "a1", toolCallId: "t1" });
  assert.equal(received.length, 1, "the live channel's approval request reaches the host");

  const second = fakeChannel("second");
  wiring.setUIChannel(second);
  assert.equal(wiring.getUI(), second, "the binding moved to the new channel");
  assert.equal(first.listenerCount, 0, "the replaced channel was unsubscribed");

  first.fire({ approvalId: "a2", toolCallId: "t2" });
  assert.equal(
    received.length,
    1,
    "the replaced channel no longer delivers — otherwise a rebind double-reports every approval"
  );

  second.fire({ approvalId: "a3", toolCallId: "t3" });
  assert.equal(received.length, 2, "the new channel delivers");
  assert.equal(received[1].approvalId, "a3");

  // Incomplete requests are ignored rather than upserted with undefined ids.
  second.fire({ toolCallId: "t4" });
  second.fire({ approvalId: "a5" });
  assert.equal(received.length, 2, "a request missing approvalId or toolCallId is not forwarded");

  // Binding `undefined` detaches.
  wiring.setUIChannel(undefined);
  assert.equal(wiring.getUI(), undefined);
  assert.equal(second.listenerCount, 0, "unbinding unsubscribes");
  second.fire({ approvalId: "a4", toolCallId: "t5" });
  assert.equal(received.length, 2, "an unbound channel delivers nothing");

  console.log("ui channel: rebind detaches, undefined detaches, incomplete requests ignored");
}

// ---------------------------------------------------------------------------
// 3. The channel receives the scoped bus
// ---------------------------------------------------------------------------
{
  const bus = { scopeId: "agent-1" };
  const wiring = new RunnerWiring({ getEventBus: () => bus, onApprovalRequest: () => {} });

  const channel = fakeChannel("with-bus");
  wiring.setUIChannel(channel);
  assert.equal(
    channel.eventBus,
    bus,
    "the channel gets the agent's scoped bus — without it session:messages is never projected"
  );

  // No bus yet (the wiring is built before setEventBus): binding still succeeds.
  const early = new RunnerWiring({ getEventBus: () => undefined, onApprovalRequest: () => {} });
  const earlyChannel = fakeChannel("early");
  early.setUIChannel(earlyChannel);
  assert.equal(early.getUI(), earlyChannel, "a channel can be bound before the bus exists");
  assert.equal(earlyChannel.eventBus, undefined, "no bus is attached when there is none yet");
  assert.equal(earlyChannel.listenerCount, 1, "the approval subscription is still wired");

  console.log("ui channel: bus attached when available, binding still succeeds without one");
}

// ---------------------------------------------------------------------------
// 4. detachUIChannel releases the subscription without dropping the binding
// ---------------------------------------------------------------------------
{
  const received = [];
  const wiring = new RunnerWiring({
    getEventBus: () => undefined,
    onApprovalRequest: (request) => received.push(request),
  });
  const channel = fakeChannel("detach");
  wiring.setUIChannel(channel);
  wiring.detachUIChannel();
  assert.equal(channel.listenerCount, 0, "detach releases the subscription");
  assert.equal(wiring.getUI(), channel, "detach leaves the binding in place (destroy path)");
  channel.fire({ approvalId: "a1", toolCallId: "t1" });
  assert.equal(received.length, 0, "a detached channel delivers nothing");
  console.log("ui channel: detach releases the subscription and keeps the binding");
}

// ---------------------------------------------------------------------------
// 5. Text adapter is plain storage (no invalidation coupling, by design)
// ---------------------------------------------------------------------------
{
  const wiring = new RunnerWiring({ getEventBus: () => undefined, onApprovalRequest: () => {} });
  assert.equal(wiring.getTextAdapter(), undefined);
  const adapter = { model: "m", style: "openai" };
  wiring.setTextAdapter(adapter);
  assert.equal(wiring.getTextAdapter(), adapter);
  wiring.setTextAdapter(undefined);
  assert.equal(wiring.getTextAdapter(), undefined, "the adapter slot can be cleared");
  console.log("text adapter: stores and clears");
}

console.log("\nrunner-wiring validation passed");
