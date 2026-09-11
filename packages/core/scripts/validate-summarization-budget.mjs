import assert from "node:assert/strict";

import {
  DEFAULT_SUMMARIZATION_CONTEXT_WINDOW,
  SUMMARY_OUTPUT_CAP,
  measureSerializedConversationChars,
  resolveSummarizationBudget,
  resolveSummarizationInputBudget,
  resolveAutoCompactTrigger,
  splitMessagesByTokenBudget,
} from "../dist/dev.mjs";

// ============================================================================
// Model-metadata-driven budget
// ============================================================================

// Real model output cap drives the reserve → single-pass for typical models.
{
  const b = resolveSummarizationBudget({ contextWindow: 128_000, defaultMaxTokens: 16_000 });
  assert.equal(b.maxOutputTokens, 16_000, "maxOutputTokens should use the model's real cap");
  assert.equal(b.inputBudget, 128_000 - 16_000 - 8_000, "inputBudget reserves output + overhead");
}
{
  const b = resolveSummarizationBudget({ contextWindow: 400_000, defaultMaxTokens: 16_000 });
  assert.equal(b.maxOutputTokens, 16_000);
  assert.equal(b.inputBudget, 400_000 - 16_000 - 8_000);
}
{
  const b = resolveSummarizationBudget({ contextWindow: 1_000_000, defaultMaxTokens: 32_000 });
  assert.equal(b.maxOutputTokens, 32_000);
  assert.equal(b.inputBudget, 1_000_000 - 32_000 - 8_000);
}

// A model's declared max output is capped so it cannot starve the input budget.
{
  const b = resolveSummarizationBudget({ contextWindow: 1_000_000, defaultMaxTokens: 384_000 });
  assert.equal(b.maxOutputTokens, SUMMARY_OUTPUT_CAP, "output reserve is capped");
  assert.equal(
    b.inputBudget,
    1_000_000 - SUMMARY_OUTPUT_CAP - 8_000,
    "inputBudget keeps the window minus the capped reserve"
  );
}

// Fallback when the model reports no output cap: derive a window-based reserve.
{
  const b = resolveSummarizationBudget({ contextWindow: 128_000 });
  assert.equal(b.maxOutputTokens, Math.floor(128_000 * 0.12), "fallback reserve derived from window");
  assert.equal(b.inputBudget, 128_000 - b.maxOutputTokens - 8_000);
}

// Unknown model: default context window + fallback reserve.
{
  const b = resolveSummarizationBudget(undefined);
  assert.equal(
    b.inputBudget,
    Math.max(
      16_000,
      DEFAULT_SUMMARIZATION_CONTEXT_WINDOW - Math.floor(DEFAULT_SUMMARIZATION_CONTEXT_WINDOW * 0.12) - 8_000
    )
  );
  assert.equal(b.maxOutputTokens, Math.floor(DEFAULT_SUMMARIZATION_CONTEXT_WINDOW * 0.12));
}

// resolveSummarizationInputBudget (manager-backed) matches the model path.
{
  const inputBudget = resolveSummarizationInputBudget(
    { getAgent: () => ({ getModelInfo: () => ({ contextWindow: 128_000, defaultMaxTokens: 16_000 }) }) },
    "agent-1"
  );
  assert.equal(inputBudget, 128_000 - 16_000 - 8_000, "inputBudget from model metadata");
}

// ============================================================================
// Single-pass default: budget covers the trigger slice (default config 80%)
// ============================================================================
function triggerFor(window, tokenThreshold) {
  return resolveAutoCompactTrigger({ tokenThreshold, compactAtPercent: 80 }, window).triggerAt;
}

for (const [label, window, tokenThreshold, defaultMaxTokens] of [
  ["128k", 128_000, 128_000, 16_000],
  ["400k", 400_000, 400_000, 16_000],
  ["1M (cap 400k)", 1_000_000, 400_000, 32_000],
]) {
  const b = resolveSummarizationBudget({ contextWindow: window, defaultMaxTokens });
  const trigger = triggerFor(window, tokenThreshold);
  assert.ok(
    b.inputBudget >= trigger,
    `${label}: budget ${b.inputBudget} should cover trigger ${trigger} (single-pass)`
  );
}

// ============================================================================
// splitMessagesByTokenBudget — single-pass default + genuine overflow fallback
// ============================================================================

// A small slice stays one batch under the model-derived budget.
{
  const { inputBudget } = resolveSummarizationBudget({ contextWindow: 128_000, defaultMaxTokens: 16_000 });
  const slice = [
    { role: "user", content: "short message" },
    { role: "assistant", content: "ok" },
  ];
  const batches = splitMessagesByTokenBudget(slice, inputBudget);
  assert.equal(batches.length, 1, "a slice within budget should stay a single batch");
  assert.equal(batches.flat().length, slice.length);
}

// A ~2× budget slice splits (fallback preserved).
{
  const { inputBudget } = resolveSummarizationBudget({ contextWindow: 128_000, defaultMaxTokens: 16_000 });
  const huge = Array.from({ length: 21 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: "x".repeat(40_000),
  }));
  const batches = splitMessagesByTokenBudget(huge, inputBudget);
  assert.ok(batches.length > 1, "an oversized (2× budget) slice should split");
  assert.equal(batches.flat().length, huge.length);
}

// ============================================================================
// splitMessagesByTokenBudget — sizes the *serialized* prompt, not the raw wire
// ============================================================================

// A huge (untruncated) tool result fits one batch because the serializer only
// keeps TOOL_RESULT_MAX_CHARS of it. This is the regression that forced
// needless multi-segment compaction (raw estimate >> actual prompt).
{
  const toolCallId = "call_huge";
  const slice = [
    {
      role: "assistant",
      content: "read the file",
      toolCalls: [{ id: toolCallId, type: "function", function: { name: "read_file", arguments: "{}" } }],
    },
    { role: "tool", toolCallId, content: "x".repeat(200_000) },
  ];

  const measured = measureSerializedConversationChars(slice);
  assert.ok(measured < 10_000, `serialized measure should truncate tool output (got ${measured})`);

  const batches = splitMessagesByTokenBudget(slice, 5_000);
  assert.equal(batches.length, 1, "truncated tool output must not force a split");
}

// A genuinely oversized serialized slice still splits (fallback preserved).
{
  const huge = Array.from({ length: 6 }, () => ({ role: "user", content: "y".repeat(40_000) }));
  const batches = splitMessagesByTokenBudget(huge, 50_000);
  assert.ok(batches.length > 1, "an oversized serialized slice should still split");
  assert.equal(batches.flat().length, huge.length);
}

console.log("summarization-budget validation passed");
