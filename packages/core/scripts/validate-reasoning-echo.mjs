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

assert.equal(shouldEchoReasoningContent({ capabilities: ["streaming", "reasoning"] }), true);
assert.equal(shouldEchoReasoningContent({ capabilities: ["streaming", "tool_calling"] }), false);
assert.equal(shouldEchoReasoningContent({ capabilities: [] }), false);

// Unknown / missing metadata conservatively uses the reasoning adapter
// (a no-op superset of the plain adapter) so reasoning is never silently dropped.
assert.equal(shouldEchoReasoningContent(null), true);
assert.equal(shouldEchoReasoningContent(undefined), true);

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
