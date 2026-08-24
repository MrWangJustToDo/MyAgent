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

const retryStates = [];
const retryEvents = [];
const managed = {
  parentId: "sub-agent",
  usage: null,
  log: { warn() {}, debug() {}, error() {} },
  setError() {},
  setRetry(state) {
    retryStates.push(state);
  },
  emitEvent(type, payload) {
    if (type === "agent:retry") retryEvents.push(payload);
  },
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

// Retry visibility: one recorded retry, cleared once the stream recovers
assert.equal(retryStates.length, 2, "retry set on failure + cleared on recovery");
assert.equal(retryStates[0].attempt, 1);
assert.equal(retryStates[0].maxAttempts >= 1, true);
assert.equal(retryStates[0].strategy, "transient");
assert.match(retryStates[0].error, /429/);
assert.equal(typeof retryStates[0].delayMs, "number");
assert.equal(retryStates[1], null);
assert.equal(retryEvents.length, 1);
assert.equal(retryEvents[0].strategy, "transient");
assert.equal(retryEvents[0].attempt, 1);

// --- subagent restart-style retry soft-resets UI + clears error status ---

attempts = 0;
let resetCalls = 0;
let recoveryRetryCalls = 0;
let lastError = "stale";
const subManaged = {
  parentId: "parent-1",
  usage: null,
  log: { warn() {}, debug() {}, error() {} },
  setError(error) {
    lastError = error;
  },
  ui: {
    resetForStreamRetry() {
      resetCalls += 1;
    },
  },
  statusController: {
    onRecoveryRetry() {
      recoveryRetryCalls += 1;
    },
  },
};

const subOut = [];
for await (const chunk of runStreamWithRecovery({
  managed: subManaged,
  manager: {},
  getMessages: () => msgs,
  run: () => flakyThenOk(),
})) {
  subOut.push(chunk.type);
}
assert.equal(attempts, 2);
assert.equal(resetCalls, 1, "subagent should soft-reset UI before restart retry");
assert.equal(recoveryRetryCalls, 1, "subagent should clear error status before backoff");
assert.equal(lastError, "");
assert.deepEqual(subOut, ["TEXT_MESSAGE_CONTENT", "RUN_FINISHED"]);

// --- root agent restart does not call resetForStreamRetry ---

attempts = 0;
resetCalls = 0;
recoveryRetryCalls = 0;
const rootManaged = {
  usage: null,
  log: { warn() {}, debug() {}, error() {} },
  setError() {},
  ui: {
    resetForStreamRetry() {
      resetCalls += 1;
    },
  },
  statusController: {
    onRecoveryRetry() {
      recoveryRetryCalls += 1;
    },
  },
};

for await (const chunk of runStreamWithRecovery({
  managed: rootManaged,
  manager: {},
  getMessages: () => msgs,
  run: () => flakyThenOk(),
})) {
  void chunk;
}
assert.equal(attempts, 2);
assert.equal(resetCalls, 0, "root agent must not wipe UI on transient retry");
assert.equal(recoveryRetryCalls, 1, "root still clears error status via onRecoveryRetry");

console.log("run-stream-recovery validation passed");
