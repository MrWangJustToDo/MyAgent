/**
 * Validates instrumentMiddlewareLog: each middleware hook invocation is
 * recorded to the agent log (category `hooks`, debug level) with phase +
 * iteration, return values (sync + async/promise) pass through untouched,
 * high-frequency onChunk and nested sandbox hooks are skipped, and middleware
 * without a name fall back to "anonymous".
 *
 * Run: pnpm --filter @my-agent/core run validate:middleware-log
 */

import assert from "node:assert/strict";

import { AgentLog, instrumentMiddlewareLog } from "../dist/dev.mjs";

// A realistic ChatMiddleware-shaped object (plain object, like the create*
// factories return).
const calls = [];
const middleware = [
  {
    name: "test-middleware",
    onConfig: (ctx, config) => {
      calls.push({ hook: "onConfig", phase: ctx.phase, iteration: ctx.iteration });
      return { messages: [...config.messages, "transformed"] };
    },
    onStart: (ctx) => {
      calls.push({ hook: "onStart", phase: ctx.phase, iteration: ctx.iteration });
    },
    // High-frequency hooks that must NOT be logged or wrapped.
    onChunk: () => {
      calls.push({ hook: "onChunk" });
      return "chunk";
    },
    sandbox: {
      onFile: () => {},
    },
  },
  {
    // No name → anonymous fallback.
    onIteration: async (ctx) => {
      calls.push({ hook: "onIteration", phase: ctx.phase, iteration: ctx.iteration });
      return "iter";
    },
  },
];

const ctx = {
  phase: "beforeModel",
  iteration: 2,
};

const log = new AgentLog();
const wrapped = instrumentMiddlewareLog(middleware, log);

// ----------------------------------------------------------------------------
// 1. Named middleware: hooks logged + return value passed through.
// ----------------------------------------------------------------------------
const configOut = wrapped[0].onConfig(ctx, { messages: ["a"] });
assert.deepEqual(configOut, { messages: ["a", "transformed"] }, "onConfig return passes through");
assert.deepEqual(calls[0], { hook: "onConfig", phase: "beforeModel", iteration: 2 });

const startOut = wrapped[0].onStart(ctx);
assert.equal(startOut, undefined, "onStart void return passes through");

// ----------------------------------------------------------------------------
// 2. Anonymous middleware: async hook resolved + logged.
// ----------------------------------------------------------------------------
const iterOut = await wrapped[1].onIteration(ctx);
assert.equal(iterOut, "iter", "async hook return passes through");
assert.deepEqual(calls[2], { hook: "onIteration", phase: "beforeModel", iteration: 2 });

// ----------------------------------------------------------------------------
// 3. onChunk / sandbox are NOT wrapped.
// ----------------------------------------------------------------------------
assert.equal(wrapped[0].onChunk(ctx), "chunk", "onChunk untouched");
assert.equal(typeof wrapped[0].sandbox.onFile, "function", "sandbox untouched");
assert.equal(wrapped[0].onChunk === middleware[0].onChunk, true, "onChunk identity preserved (not wrapped)");

// ----------------------------------------------------------------------------
// 4. Agent log entries: category hooks, debug level, phase + iteration data.
// ----------------------------------------------------------------------------
const entries = log.getEntries();
assert.ok(entries.length >= 2, `expected >=2 hook entries, got ${entries.length}`);
for (const entry of entries) {
  assert.equal(entry.category, "hooks", `category hooks, got ${entry.category}`);
  assert.equal(entry.level, "debug", `level debug, got ${entry.level}`);
}

assert.ok(
  entries.some((e) => e.message === "middleware:test-middleware:onConfig"),
  `has test-middleware:onConfig entry, got ${entries.map((e) => e.message).join(", ")}`
);
assert.ok(
  entries.some((e) => e.message === "middleware:anonymous:onIteration"),
  `has anonymous:onIteration entry, got ${entries.map((e) => e.message).join(", ")}`
);
assert.ok(
  entries.every((e) => e.message !== "middleware:test-middleware:onChunk"),
  "onChunk must not be logged"
);

const onConfigEntry = entries.find((e) => e.message === "middleware:test-middleware:onConfig");
assert.deepEqual(onConfigEntry.data, { phase: "beforeModel", iteration: 2 }, "phase+iteration in data");

console.log("named/anonymous hooks logged with phase+iteration: OK");
console.log("sync + async return values passed through: OK");
console.log("onChunk / sandbox skipped (identity preserved): OK");
console.log("middleware-log validation passed");
