/**
 * Validates typed AgentEvent envelope (ts, sessionId, payload) and JSON round-trip.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-event-envelope
 */

import assert from "node:assert/strict";

import { emitAgentTelemetry } from "../dist/dev.mjs";

const events = [];

const emitter = {
  id: "agent-1",
  getSessionData: () => ({ id: "session-abc" }),
  dispatchEvent: (event) => events.push(event),
};

emitAgentTelemetry(emitter, "prompt:submit", { prompt: "hello", contextMessageCount: 3 });

assert.equal(events.length, 1);
assert.equal(events[0].type, "prompt:submit");
assert.equal(events[0].agentId, "agent-1");
assert.equal(typeof events[0].ts, "number");
assert.equal(events[0].sessionId, "session-abc");
assert.equal(events[0].payload?.prompt, "hello");
assert.equal(events[0].data, undefined);

const roundTrip = JSON.parse(JSON.stringify(events[0]));
assert.equal(roundTrip.payload.prompt, "hello");
assert.equal(roundTrip.sessionId, "session-abc");

emitAgentTelemetry(emitter, "subagent:completed", { subagentId: "child-1", summary: "done" }, { parentId: "parent-1" });

assert.equal(events.length, 2);
assert.equal(events[1].parentId, "parent-1");
assert.equal(events[1].payload.summary, "done");

emitAgentTelemetry(emitter, "agent:thinking");
assert.equal(events.length, 3);
assert.equal(events[2].type, "agent:thinking");
assert.deepEqual(events[2].payload, {});

emitAgentTelemetry({ id: "no-dispatch" }, "agent:stop", { reason: "x" });
assert.equal(events.length, 3);

console.log("agent-event-envelope validation passed");
