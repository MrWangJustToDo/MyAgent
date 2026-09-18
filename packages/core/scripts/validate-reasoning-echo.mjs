/**
 * Validation for DeepSeek reasoning_content echo helpers + adapter cache.
 *
 * Run: pnpm --filter @codent/core run validate:reasoning-echo
 */

import assert from "node:assert/strict";

import {
  ReasoningContentCache,
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  resolveReasoningContentForAssistant,
  resolveReasoningEchoField,
  shouldEchoReasoning,
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

assert.equal(shouldEchoReasoningContent({ capabilities: ["reasoning"] }), true);
assert.equal(shouldEchoReasoningContent({ capabilities: ["tool_calling"] }), false);
assert.equal(shouldEchoReasoningContent({ capabilities: [] }), false);

// Unknown / missing metadata conservatively uses the reasoning adapter
// (a no-op superset of the plain adapter) so reasoning is never silently dropped.
assert.equal(shouldEchoReasoningContent(null), true);
assert.equal(shouldEchoReasoningContent(undefined), true);

// --- metadata breadth: `interleaved`, not just the `reasoning` capability -------------------
//
// `interleaved` is the only models.dev field that speaks to "does reasoning come back interleaved
// with tool calls, and on which field". 1083 entries carry it, and 2 of them declare
// `reasoning: false` while naming a reasoning echo field — a capability-only test gave those two
// no echo adapter at all.
assert.equal(
  shouldEchoReasoningContent({ capabilities: [], reasoningInterleaved: true }),
  true,
  "an interleaved model must route through the reasoning adapter even without the capability flag"
);
assert.equal(
  shouldEchoReasoningContent({ capabilities: ["reasoning"], reasoningInterleaved: undefined }),
  true,
  "the capability flag alone still routes (no metadata regression)"
);
assert.equal(
  shouldEchoReasoningContent({ capabilities: [], reasoningInterleaved: undefined }),
  false,
  "neither signal present means the plain adapter"
);

// `interleaved` → echo field. Only `reasoning_details` is an override: the other two shapes
// (`true`, and `{field:"reasoning_content"}`) both mean the `reasoning_content` default we
// already implement, so they must resolve to undefined rather than to a redundant field name.
assert.equal(shouldEchoReasoning({ reasoning: true }), true);
assert.equal(shouldEchoReasoning({ reasoning: false }), false);
assert.equal(shouldEchoReasoning({ reasoning: false, interleaved: { field: "reasoning_content" } }), true);
assert.equal(shouldEchoReasoning({ reasoning: false, interleaved: true }), true);
assert.equal(shouldEchoReasoning({}), false);

assert.equal(resolveReasoningEchoField({ interleaved: { field: "reasoning_details" } }), "reasoning_details");
assert.equal(
  resolveReasoningEchoField({ interleaved: { field: "reasoning_content" } }),
  undefined,
  "reasoning_content IS the default — resolving it explicitly would be redundant, not wrong"
);
assert.equal(resolveReasoningEchoField({ interleaved: true }), undefined, "a bare true names no field");
assert.equal(resolveReasoningEchoField({}), undefined, "absent metadata means default, not 'no echo'");

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
