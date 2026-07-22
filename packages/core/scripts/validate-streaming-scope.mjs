/**
 * Validates agent-scoped streaming callback isolation.
 *
 * Run: pnpm --filter @my-agent/core run validate:streaming-scope
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

const chunksA = [];
const chunksB = [];

const unsubA = subscribeStreamingCallback((data) => chunksA.push(data), { agentId: "agent-a" });
const unsubB = subscribeStreamingCallback((data) => chunksB.push(data), { agentId: "agent-b" });

emitStreamingChunk("call-a", "stdout", "from-a", { agentId: "agent-a" });
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 0);
assert.equal(chunksA[0].chunk, "from-a");

emitStreamingChunk("call-b", "stderr", "from-b", { agentId: "agent-b" });
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 1);
assert.equal(chunksB[0].type, "stderr");

const clearedA = [];
const clearedB = [];
const unsubClearA = subscribeStreamingClearCallback((id) => clearedA.push(id), { agentId: "agent-a" });
const unsubClearB = subscribeStreamingClearCallback((id) => clearedB.push(id), { agentId: "agent-b" });

clearStreamingOutput("call-a", { agentId: "agent-a" });
assert.deepEqual(clearedA, ["call-a"]);
assert.deepEqual(clearedB, []);

unsubA();
unsubB();
unsubClearA();
unsubClearB();
resetStreamingCallbacksForTests();
assert.equal(getStreamingSubscriberCounts().chunk, 0);
assert.equal(getStreamingSubscriberCounts().scopedChunkAgents, 0);

console.log("streaming-scope validation passed");
