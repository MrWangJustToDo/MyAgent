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
