/**
 * Validates emitAgentEvent session_id injection and dispatch wiring.
 *
 * Run: pnpm --filter @my-agent/core run validate:emit-agent-event
 */
/* eslint-disable no-undef, import/no-useless-path-segments */
import assert from "node:assert/strict";

import { emitAgentEvent } from "../dist/index.mjs";

const events = [];

const emitter = {
  id: "agent-1",
  getSessionData: () => ({ id: "session-abc" }),
  dispatchEvent: (event) => events.push(event),
};

emitAgentEvent(emitter, "prompt:submit", { data: { prompt: "hello" } });

assert.equal(events.length, 1);
assert.equal(events[0].type, "prompt:submit");
assert.equal(events[0].agentId, "agent-1");
assert.equal(events[0].data?.session_id, "session-abc");
assert.equal(events[0].data?.prompt, "hello");

emitAgentEvent(emitter, "subagent:started", {
  parentId: "parent-1",
  data: { session_id: "override-session", description: "explore" },
});

assert.equal(events.length, 2);
assert.equal(events[1].parentId, "parent-1");
assert.equal(events[1].data?.session_id, "override-session");

emitAgentEvent({ id: "no-dispatch" }, "agent:stop");
assert.equal(events.length, 2);

console.log("emitAgentEvent validation passed");
