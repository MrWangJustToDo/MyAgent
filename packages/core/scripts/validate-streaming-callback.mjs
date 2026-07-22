/**
 * Validates multicast streaming callback subscriptions (agent-scoped).
 *
 * Run: pnpm --filter @my-agent/core run validate:streaming-callback
 */

import assert from "node:assert/strict";

import {
  clearStreamingOutput,
  emitStreamingChunk,
  getStreamingSubscriberCounts,
  resetStreamingCallbacksForTests,
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "../dist/dev.mjs";

resetStreamingCallbacksForTests();
assert.deepEqual(getStreamingSubscriberCounts(), {
  chunk: 0,
  clear: 0,
  scopedChunkAgents: 0,
  scopedClearAgents: 0,
});

const chunksA = [];
const chunksB = [];
const unsubA = subscribeStreamingCallback((data) => chunksA.push(data), { agentId: "agent-a" });
const unsubB = subscribeStreamingCallback((data) => chunksB.push(data), { agentId: "agent-a" });

assert.equal(getStreamingSubscriberCounts().chunk, 2);

emitStreamingChunk("call-1", "stdout", "hello", { agentId: "agent-a" });
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 1);
assert.equal(chunksA[0].chunk, "hello");

unsubA();
assert.equal(getStreamingSubscriberCounts().chunk, 1);

emitStreamingChunk("call-1", "stderr", "warn", { agentId: "agent-a" });
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 2);
assert.equal(chunksB[1].type, "stderr");

// Other agent scope must not receive
emitStreamingChunk("call-1", "stdout", "nope", { agentId: "agent-b" });
assert.equal(chunksB.length, 2);

unsubB();
assert.equal(getStreamingSubscriberCounts().chunk, 0);

const cleared = [];
const unsubClear = subscribeStreamingClearCallback((toolCallId) => cleared.push(toolCallId), {
  agentId: "agent-a",
});
clearStreamingOutput("call-2", { agentId: "agent-a" });
assert.deepEqual(cleared, ["call-2"]);
unsubClear();
resetStreamingCallbacksForTests();

console.log("streaming-callback validation passed");
