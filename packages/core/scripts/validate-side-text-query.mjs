/**
 * Validation for side-text-query stream accumulation + the structured-root guard
 * (no network).
 *
 * Run: pnpm --filter @codent/core run validate:side-text-query
 */

import { streamToText } from "@tanstack/ai";
import assert from "node:assert/strict";

import { runSideTextQuery } from "../dist/dev.mjs";

const chunks = [
  { type: "TEXT_MESSAGE_CONTENT", delta: "hello " },
  { type: "TEXT_MESSAGE_CONTENT", delta: "world" },
  { type: "RUN_FINISHED", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
];

async function* mockStream() {
  for (const chunk of chunks) {
    yield chunk;
  }
}

const text = await streamToText(mockStream());
assert.equal(text, "hello world");
assert.equal(typeof runSideTextQuery, "function");

// ---------------------------------------------------------------------------
// The structured-root guard
// ---------------------------------------------------------------------------
//
// A top-level non-object `outputSchema` used to be accepted and then fail on
// every single call: the provider builds its structured-output request from the
// schema's `properties`, so an array root is sent as `{ type: "object",
// properties: {} }`, the model invents a wrapper key, and validation can never
// succeed. Memory extraction ran that way for two days — 0 memories, one schema
// warning per turn, and nothing pointing at the request. The guard rejects the
// schema at the call site instead, so the failure is loud and immediate.

const neverCalledAdapter = {
  adapter: {
    kind: "text",
    name: "fake",
    model: "fake-model",
    "~types": {},
    chatStream() {
      throw new Error("the guard must reject before any request is issued");
    },
    async structuredOutput() {
      throw new Error("the guard must reject before any request is issued");
    },
    structuredOutputStream() {
      throw new Error("the guard must reject before any request is issued");
    },
  },
  model: "fake-model",
  modelStyle: "openai",
};

/** A stand-in for a Zod schema, reduced to the part the guard reads. */
const schemaLike = (type) => ({
  "~standard": { version: 1, jsonSchema: { input: () => ({ type }) } },
});

// A bare array is the shape that shipped broken; it must be refused.
for (const type of ["array", "string"]) {
  await assert.rejects(
    () => runSideTextQuery(neverCalledAdapter, { userPrompt: "x", schema: schemaLike(type) }),
    (err) => /requires a top-level object schema/.test(err.message) && err.message.includes(`\`"${type}"\``),
    `a top-level ${type} schema is rejected at the call site`
  );
}

// Both shipped shapes must pass the guard: an object root, and a raw JSON Schema
// with no `~standard` (nothing to introspect, so it is left alone).
for (const [label, schema] of [
  ["object root", schemaLike("object")],
  ["raw JSON Schema", { type: "object", properties: {} }],
]) {
  // It should get past the guard and blow up in the fake adapter instead.
  await assert.rejects(
    () => runSideTextQuery(neverCalledAdapter, { userPrompt: "x", schema }),
    (err) => !/requires a top-level object schema/.test(err.message),
    `a ${label} schema passes the guard`
  );
}

console.log("✓ a non-object structured root is rejected at the call site");

console.log("side-text-query validation passed");
