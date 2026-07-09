/**
 * Validates lifecycle middleware side-effects (finalize, memory commit, thinking).
 *
 * Run: pnpm --filter @my-agent/core run validate:lifecycle-middleware
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { createLifecycleMiddleware } from "../dist/dev.mjs";

let usageUpdated = false;
let thinkingEmitted = false;
let memoryCommitted = false;
const finalizeReasons = [];

const middleware = createLifecycleMiddleware({
  usage: {
    updateWindowUsage: () => {
      usageUpdated = true;
    },
    getPricing: () => null,
  },
  getPricing: () => null,
  onThinking: () => {
    thinkingEmitted = true;
  },
  onFirstModelOutput: () => {
    memoryCommitted = true;
  },
  onRunFinalize: (reason) => {
    finalizeReasons.push(reason);
  },
});

middleware.onStart?.();
await middleware.onChunk?.(undefined, { type: "REASONING_MESSAGE_START" });
assert.equal(thinkingEmitted, true);

middleware.onStart?.();
await middleware.onChunk?.(undefined, { type: "TEXT_MESSAGE_CONTENT", delta: "hi" });
assert.equal(memoryCommitted, true);

middleware.onStart?.();
await middleware.onUsage?.(undefined, { inputTokens: 1, outputTokens: 2, totalTokens: 3 });
assert.equal(usageUpdated, true);

middleware.onStart?.();
await middleware.onFinish?.(undefined, { finishReason: "stop" });
await middleware.onFinish?.(undefined, { finishReason: "stop" });
assert.deepEqual(finalizeReasons, ["finished"]);

console.log("lifecycle-middleware validation passed");
