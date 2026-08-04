/**
 * Validates stream recovery orchestrator (runStreamWithRecovery + helpers).
 *
 * Run: pnpm --filter @my-agent/core run validate:run-stream-recovery
 */

import assert from "node:assert/strict";

import {
  extractRetryAfterSeconds,
  isTransientRetryableError,
  messagesForModelCapabilities,
  retryDelayMs,
  runStreamWithRecovery,
} from "../dist/dev.mjs";

// --- detectors ---

assert.equal(isTransientRetryableError(new Error("429 Too Many Requests")), true);
assert.equal(isTransientRetryableError(new Error("rate_limit_exceeded")), true);
assert.equal(isTransientRetryableError({ status: 429, message: "busy" }), true);
assert.equal(isTransientRetryableError(new Error("503 Service Unavailable")), true);
assert.equal(isTransientRetryableError(new Error("fetch failed")), true);
assert.equal(isTransientRetryableError(new Error("quota exceeded")), false);
assert.equal(isTransientRetryableError(new Error("insufficient_quota")), false);
assert.equal(isTransientRetryableError(new Error("invalid api key")), false);

assert.equal(extractRetryAfterSeconds(new Error("please retry after 12 seconds")), 12);
assert.equal(extractRetryAfterSeconds({ retryAfter: 3, message: "429" }), 3);
assert.equal(extractRetryAfterSeconds(new Error("no hint")), undefined);

const delay0 = retryDelayMs(0);
assert.ok(delay0 >= 500 && delay0 <= 500 * 1.25);
assert.equal(retryDelayMs(0, 2), 2000);

// --- non-retryable RUN_ERROR still throws ---

async function* onlyRunError() {
  yield { type: "RUN_ERROR", message: "quota exceeded" };
}

let threw = false;
try {
  for await (const chunk of runStreamWithRecovery({
    managed: { parentId: "sub", usage: { hasCapability: () => true } },
    manager: {},
    getMessages: () => [],
    run: () => onlyRunError(),
  })) {
    assert.ok(chunk.type !== "RUN_ERROR");
  }
} catch (error) {
  threw = true;
  assert.equal(error instanceof Error ? error.message : String(error), "quota exceeded");
}
assert.equal(threw, true);

// --- 429 retries then succeeds (subagent-shaped managed; short Retry-After) ---

class RateLimitError extends Error {
  status = 429;
  retryAfter = 0.01;
  constructor() {
    super("429 Too Many Requests");
    this.name = "RateLimitError";
  }
}

let attempts = 0;
async function* flakyThenOk() {
  attempts += 1;
  if (attempts === 1) {
    throw new RateLimitError();
  }
  yield { type: "TEXT_MESSAGE_CONTENT", delta: "ok" };
  yield { type: "RUN_FINISHED", finishReason: "stop" };
}

const managed = {
  parentId: "sub-agent",
  usage: null,
  log: { warn() {}, debug() {}, error() {} },
  setError() {},
};
const msgs = [{ role: "user", content: "hi" }];
assert.equal(messagesForModelCapabilities(managed, msgs), msgs);

const out = [];
for await (const chunk of runStreamWithRecovery({
  managed,
  manager: {},
  getMessages: () => msgs,
  run: () => flakyThenOk(),
})) {
  out.push(chunk.type);
}
assert.equal(attempts, 2);
assert.deepEqual(out, ["TEXT_MESSAGE_CONTENT", "RUN_FINISHED"]);

console.log("run-stream-recovery validation passed");
