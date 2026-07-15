/**
 * Validation for side-text-query stream accumulation (no network).
 *
 * Run: pnpm --filter @my-agent/core run validate:side-text-query
 */
/* eslint-disable import/no-useless-path-segments */
import { streamToText } from "@tanstack/ai";
import assert from "node:assert/strict";

import { runSideTextQuery } from "../dist/index.mjs";

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

console.log("side-text-query validation passed");
