/**
 * Validates subagent iteration counting and run-stat derivation.
 *
 * Run: pnpm --filter @my-agent/core run validate:subagent-run-stats
 */

import assert from "node:assert/strict";

import { countSubagentIterations, deriveSubagentRunStats } from "../dist/dev.mjs";

const messages = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "Exploring." },
      { type: "tool-call", id: "tc1", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "{}", state: "complete" },
      { type: "tool-call", id: "tc2", name: "grep", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc2", content: "[]", state: "complete" },
      { type: "text", content: "## Final Summary\n\nDone." },
    ],
  },
];

assert.equal(countSubagentIterations(messages), 2);

const stats = deriveSubagentRunStats({
  messages,
  maxIterations: 50,
  finishReason: "stop",
  output: "## Final Summary\n\nDone.",
  aborted: false,
  status: "completed",
});

assert.equal(stats.iterations, 2);
assert.equal(stats.reachedLimit, false);
assert.equal(stats.incomplete, false);

const limited = deriveSubagentRunStats({
  messages,
  maxIterations: 2,
  finishReason: "max-steps",
  output: "## Final Summary\n\nDone.",
  aborted: false,
  status: "completed",
});

assert.equal(limited.reachedLimit, true);
assert.equal(limited.incomplete, false);

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

const incomplete = deriveSubagentRunStats({
  messages,
  maxIterations: 50,
  finishReason: "stop",
  output: "(no summary)",
  aborted: false,
  status: "error",
});

assert.equal(incomplete.incomplete, true);

console.log("subagent-run-stats validation passed");
