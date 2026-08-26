/**
 * Validates subagent iteration counting and run-stat derivation.
 *
 * Run: pnpm --filter @my-agent/core run validate:subagent-run-stats
 */

import assert from "node:assert/strict";

import { countSubagentIterations, deriveSubagentRunStats, hasBeginSummaryCall } from "../dist/dev.mjs";

const exploreDone = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "Exploring." },
      { type: "tool-call", id: "tc1", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "{}", state: "complete" },
      { type: "tool-call", id: "tc2", name: "grep", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc2", content: "[]", state: "complete" },
      { type: "tool-call", id: "tc3", name: "begin_summary", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc3", content: '{"ready":true}', state: "complete" },
      { type: "text", content: "## Final Summary\n\nDone." },
    ],
  },
];

assert.equal(countSubagentIterations(exploreDone), 3);
assert.equal(hasBeginSummaryCall(exploreDone), true);

const stats = deriveSubagentRunStats({
  messages: exploreDone,
  maxIterations: 50,
  finishReason: "stop",
  output: "## Final Summary\n\nDone.",
  aborted: false,
  status: "completed",
});

assert.equal(stats.iterations, 3);
assert.equal(stats.reachedLimit, false);
assert.equal(stats.incomplete, false);

// TanStack step-budget cutoff leaves finishReason tool_calls (no special max-steps reason).
const cutOffMessages = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "Exploring." },
      { type: "tool-call", id: "tc1", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "{}", state: "complete" },
    ],
  },
];

const limited = deriveSubagentRunStats({
  messages: cutOffMessages,
  maxIterations: 50,
  finishReason: "tool_calls",
  output: "Exploring.",
  aborted: false,
  status: "completed",
});

assert.equal(limited.reachedLimit, true);
assert.equal(limited.incomplete, true);

// Partial explore text without begin_summary must not look "complete".
const noBegin = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "Found middleware." },
      { type: "tool-call", id: "tc1", name: "grep", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "[]", state: "complete" },
      { type: "text", content: "Still looking…" },
    ],
  },
];

const missingBegin = deriveSubagentRunStats({
  messages: noBegin,
  maxIterations: 50,
  finishReason: "stop",
  output: "Still looking…",
  aborted: false,
  status: "completed",
});

assert.equal(missingBegin.reachedLimit, false);
assert.equal(missingBegin.incomplete, true);

const singleIteration = deriveSubagentRunStats({
  messages: [{ id: "assistant-1", role: "assistant", parts: [{ type: "text", content: "Summary." }] }],
  maxIterations: 1,
  finishReason: "stop",
  output: "Summary.",
  aborted: false,
  status: "completed",
});

assert.equal(singleIteration.reachedLimit, false);
assert.equal(singleIteration.incomplete, false);

const emptyError = deriveSubagentRunStats({
  messages: exploreDone,
  maxIterations: 50,
  finishReason: "stop",
  output: "(no summary)",
  aborted: false,
  status: "error",
});

assert.equal(emptyError.incomplete, true);

const lengthCut = deriveSubagentRunStats({
  messages: [{ id: "assistant-1", role: "assistant", parts: [{ type: "text", content: "Partial…" }] }],
  maxIterations: 1,
  finishReason: "length",
  output: "Partial…",
  aborted: false,
  status: "completed",
});

assert.equal(lengthCut.reachedLimit, false);
assert.equal(lengthCut.incomplete, true);

// Step-budget cutoff that ends on a TEXT narration step (finishReason "stop"):
// at/over maxIterations without begin_summary must still count as reachedLimit
// so the progress-summary fallback triggers (regression: deepseek-harness task
// ran 50 rounds, ended on "Let me read descriptor.ts briefly.", and the
// fallback was skipped because reachedLimit stayed false).
{
  const narration = [];
  for (let i = 1; i <= 50; i++) {
    narration.push({
      id: `assistant-${i}`,
      role: "assistant",
      parts: [
        { type: "text", content: `Step ${i} note.` },
        { type: "tool-call", id: `tc${i}`, name: "grep", arguments: "{}", state: "complete", output: "{}" },
        { type: "tool-result", toolCallId: `tc${i}`, content: "[]" },
      ],
    });
  }
  // Final cut step: text-only narration, no tool calls, finishReason "stop".
  narration.push({
    id: "assistant-final",
    role: "assistant",
    parts: [{ type: "text", content: "Let me read descriptor.ts briefly." }],
  });

  const stats = deriveSubagentRunStats({
    messages: narration,
    maxIterations: 50,
    finishReason: "stop",
    output: "Let me read descriptor.ts briefly.",
    aborted: false,
  });
  assert.equal(stats.iterations, 50);
  assert.equal(stats.reachedLimit, true, "budget exhausted + no begin_summary = limit reached");
  assert.equal(stats.incomplete, true);
}

// Control: same shape but begin_summary WAS called and budget not reached — natural end.
{
  const done = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", content: "Working." },
        { type: "tool-call", id: "tc1", name: "begin_summary", arguments: "{}", state: "complete", output: "{}" },
        { type: "tool-result", toolCallId: "tc1", content: '{"ready":true}' },
        { type: "text", content: "## Summary\nDone." },
      ],
    },
  ];
  const stats = deriveSubagentRunStats({
    messages: done,
    maxIterations: 50,
    finishReason: "stop",
    output: "## Summary\nDone.",
    aborted: false,
  });
  assert.equal(stats.reachedLimit, false);
  assert.equal(stats.incomplete, false);
}

// Parallel tool calls in one model turn = 1 iteration round.
const parallel = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "tool-call", id: "a", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-call", id: "b", name: "grep", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "a", content: "{}", state: "complete" },
      { type: "tool-result", toolCallId: "b", content: "[]", state: "complete" },
    ],
  },
];
assert.equal(countSubagentIterations(parallel), 1);

console.log("subagent-run-stats validation passed");
