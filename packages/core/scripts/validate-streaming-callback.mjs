/**
 * Validates multicast streaming callback subscriptions.
 *
 * Run: pnpm --filter @my-agent/core run validate:streaming-callback
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  clearStreamingOutput,
  emitStreamingChunk,
  getStreamingSubscriberCounts,
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "../dist/dev.mjs";

assert.deepEqual(getStreamingSubscriberCounts(), { chunk: 0, clear: 0 });

const chunksA = [];
const chunksB = [];
const unsubA = subscribeStreamingCallback((data) => chunksA.push(data));
const unsubB = subscribeStreamingCallback((data) => chunksB.push(data));

assert.equal(getStreamingSubscriberCounts().chunk, 2);

emitStreamingChunk("call-1", "stdout", "hello");
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 1);
assert.equal(chunksA[0].chunk, "hello");

unsubA();
assert.equal(getStreamingSubscriberCounts().chunk, 1);

emitStreamingChunk("call-1", "stderr", "warn");
assert.equal(chunksA.length, 1);
assert.equal(chunksB.length, 2);
assert.equal(chunksB[1].type, "stderr");

unsubB();
assert.equal(getStreamingSubscriberCounts().chunk, 0);

const cleared = [];
const unsubClear = subscribeStreamingClearCallback((toolCallId) => cleared.push(toolCallId));
clearStreamingOutput("call-2");
assert.deepEqual(cleared, ["call-2"]);
unsubClear();

console.log("streaming-callback validation passed");
