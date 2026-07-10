/**
 * Validation for DeepSeek reasoning_content echo helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:reasoning-echo
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  shouldEchoReasoningContent,
} from "../dist/dev.mjs";

assert.equal(
  buildReasoningContentFromThinking([{ content: "step one" }, { content: " step two" }]),
  "step one step two"
);
assert.equal(buildReasoningContentFromThinking([]), undefined);
assert.equal(buildReasoningContentFromThinking(undefined), undefined);

assert.equal(
  extractReasoningContentFromStreamChunk({
    choices: [{ delta: { reasoning_content: "chain of thought" } }],
  }),
  "chain of thought"
);
assert.equal(extractReasoningContentFromStreamChunk({ choices: [{ delta: { content: "hi" } }] }), undefined);

assert.equal(shouldEchoReasoningContent("https://api.deepseek.com", "deepseek-chat"), true);
assert.equal(shouldEchoReasoningContent("http://localhost:11434/v1", "qwen3"), false);

console.log("reasoning-echo validation passed");
