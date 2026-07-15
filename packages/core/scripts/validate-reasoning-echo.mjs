/**
 * Validation for DeepSeek reasoning_content echo helpers + adapter cache.
 *
 * Run: pnpm --filter @my-agent/core run validate:reasoning-echo
 */

import assert from "node:assert/strict";

import {
  ReasoningContentCache,
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  resolveReasoningContentForAssistant,
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
assert.equal(shouldEchoReasoningContent("https://proxy.example.com/v1", "deepseek-v4-flash"), true);
assert.equal(shouldEchoReasoningContent("http://localhost:11434/v1", "qwen3"), false);

// Adapter-local cache: restore reasoning when TanStack dropped message.thinking.
const cache = new ReasoningContentCache();
cache.remember("plan git status", ["call_1"]);
assert.equal(
  resolveReasoningContentForAssistant(
    {
      role: "assistant",
      content: null,
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "run_command", arguments: "{}" },
        },
      ],
    },
    cache
  ),
  "plan git status"
);

console.log("reasoning-echo validation passed");
