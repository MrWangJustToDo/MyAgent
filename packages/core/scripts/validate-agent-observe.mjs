/**
 * Validates ManagedAgent.observe facade filtering and idempotent teardown.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-observe
 */

import assert from "node:assert/strict";

import {
  AgentEventBus,
  observeManagedAgent,
  resetStreamingCallbacksForTests,
  emitStreamingChunk,
  DEFAULT_OBSERVE_EVENTS,
} from "../dist/dev.mjs";

resetStreamingCallbacksForTests();

const bus = new AgentEventBus();
const manager = {
  on: (type, listener) => bus.on(type, listener),
};

const stateTicks = [];
const events = [];
const chunks = [];

const target = {
  id: "agent-1",
  subscribeState: (listener) => {
    stateTicks.push("sub");
    listener();
    return () => stateTicks.push("unsub");
  },
  ui: undefined,
  log: null,
};

const unsub = observeManagedAgent(
  target,
  {
    onState: () => stateTicks.push("tick"),
    onEvent: (event) => events.push(event.type),
    events: ["agent:stop", "subagent:completed", "prompt:submit"],
    onStreaming: (chunk) => chunks.push(chunk),
  },
  manager
);

assert.ok(stateTicks.includes("tick"));
assert.ok(DEFAULT_OBSERVE_EVENTS.includes("agent:stop"));

bus.emit({ type: "agent:stop", agentId: "agent-1", data: { reason: "finished" } });
bus.emit({ type: "agent:stop", agentId: "other", data: { reason: "finished" } });
bus.emit({
  type: "subagent:completed",
  agentId: "sub-1",
  parentId: "agent-1",
  data: { summary: "ok" },
});
bus.emit({ type: "prompt:submit", agentId: "agent-1", data: { prompt: "hi" } });
bus.emit({ type: "llm:request", agentId: "agent-1" });

assert.deepEqual(events, ["agent:stop", "subagent:completed", "prompt:submit"]);

emitStreamingChunk("t1", "stdout", "x", { agentId: "agent-1" });
emitStreamingChunk("t2", "stdout", "y", { agentId: "other" });
assert.equal(chunks.length, 1);
assert.equal(chunks[0].chunk, "x");

unsub();
unsub(); // idempotent
assert.ok(stateTicks.includes("unsub"));
assert.equal(stateTicks.filter((x) => x === "unsub").length, 1);

bus.emit({ type: "agent:stop", agentId: "agent-1" });
assert.deepEqual(events, ["agent:stop", "subagent:completed", "prompt:submit"]);

resetStreamingCallbacksForTests();
console.log("agent-observe validation passed");
