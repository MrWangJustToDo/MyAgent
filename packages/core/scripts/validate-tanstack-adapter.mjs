/**
 * Smoke validation for TanStack text adapter factory.
 *
 * Run: pnpm --filter @my-agent/core run validate:tanstack-adapter
 *
 * Requires an OpenAI-compatible endpoint at BASE_URL (default http://localhost:11434/v1).
 * Set VALIDATE_TANSTACK_MODEL to override the model name (default: qwen3).
 */
/* eslint-disable no-undef */
import { chat } from "@tanstack/ai";
import assert from "node:assert/strict";

import { createTextAdapter } from "../dist/dev.mjs";

const baseURL = process.env.BASE_URL ?? "http://localhost:11434/v1";
const modelName = process.env.VALIDATE_TANSTACK_MODEL ?? "qwen3";

const { adapter, model } = createTextAdapter({
  style: "openai",
  model: modelName,
  baseURL,
});

assert.ok(adapter, "adapter should be created");
assert.equal(typeof model, "string");
assert.ok(model.length > 0, "model name should be non-empty");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);

let sawContent = false;
let sawFinished = false;

try {
  const stream = chat({
    adapter,
    model,
    messages: [{ role: "user", content: "Reply with exactly: pong" }],
    abortController: controller,
  });

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT") {
      sawContent = true;
    }
    if (chunk.type === "RUN_FINISHED") {
      sawFinished = true;
      break;
    }
    if (chunk.type === "RUN_ERROR") {
      throw new Error(`RUN_ERROR: ${JSON.stringify(chunk)}`);
    }
  }
} finally {
  clearTimeout(timeout);
}

assert.equal(sawFinished, true, "stream should emit RUN_FINISHED");
assert.equal(sawContent, true, "stream should emit TEXT_MESSAGE_CONTENT");

console.log("tanstack-adapter validation passed");
