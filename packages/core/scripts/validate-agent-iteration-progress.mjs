/**
 * Validates the agent-loop iteration ("turn") progress event:
 * the lifecycle middleware maps TanStack's 0-based `IterationInfo.iteration` to
 * 1-based {@link AgentIterationState} and reports the run's iteration budget;
 * plus the retained `iteration` channel / meta wiring.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-iteration-progress
 */

import assert from "node:assert/strict";

import { AGENT_EVENT_META, DEFAULT_AGENT_SESSION_CHANNELS, createLifecycleMiddleware } from "../dist/dev.mjs";

// --- channel / meta wiring ---------------------------------------------------

assert.equal(AGENT_EVENT_META["agent:iteration"]?.channel, "iteration");
assert.equal(AGENT_EVENT_META["agent:iteration"]?.retained, true);
assert.equal(DEFAULT_AGENT_SESSION_CHANNELS.includes("iteration"), true);

// --- middleware maps IterationInfo → 1-based progress ------------------------

{
  const seen = [];
  const mw = createLifecycleMiddleware({
    usage: {},
    getPricing: () => null,
    maxIterations: 7,
    onIteration: (state) => seen.push(state),
  });

  // 0-based on the wire (first iteration), then an arbitrary later one.
  await mw.onIteration?.({}, { iteration: 0, messageId: "m1" });
  await mw.onIteration?.({}, { iteration: 2, messageId: "m2" });

  assert.deepEqual(seen, [
    { current: 1, max: 7 },
    { current: 3, max: 7 },
  ]);
}

// No maxIterations configured → max falls back to 0 (unknown), current still 1-based.
{
  const seen = [];
  const mw = createLifecycleMiddleware({
    usage: {},
    getPricing: () => null,
    onIteration: (state) => seen.push(state),
  });
  await mw.onIteration?.({}, { iteration: 4, messageId: "m" });
  assert.deepEqual(seen, [{ current: 5, max: 0 }]);
}

// Missing onIteration hook → no throw.
{
  const mw = createLifecycleMiddleware({ usage: {}, getPricing: () => null, maxIterations: 3 });
  await mw.onIteration?.({}, { iteration: 0, messageId: "m" });
}

console.log("agent-iteration-progress validation passed");
