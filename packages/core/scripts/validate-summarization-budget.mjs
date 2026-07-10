import assert from "node:assert/strict";

import {
  DEFAULT_SUMMARIZATION_CONTEXT_WINDOW,
  resolveSummarizationInputBudget,
  splitMessagesByTokenBudget,
} from "../dist/dev.mjs";

const budget = resolveSummarizationInputBudget(
  {
    getAgent: () => ({
      getModelInfo: () => ({ contextWindow: 128_000 }),
    }),
  },
  "agent-1"
);

assert.equal(budget, Math.floor(128_000 * 0.55) - 8_000, "budget should reserve overhead from context window");

const fallbackBudget = resolveSummarizationInputBudget({ getAgent: () => undefined }, "missing");
assert.equal(
  fallbackBudget,
  Math.floor(DEFAULT_SUMMARIZATION_CONTEXT_WINDOW * 0.55) - 8_000,
  "unknown model should use default context window"
);

const messages = [
  { role: "user", content: "a".repeat(40_000) },
  { role: "assistant", content: "b".repeat(40_000) },
  { role: "user", content: "c".repeat(40_000) },
];

const batches = splitMessagesByTokenBudget(messages, 12_000);
assert.equal(batches.length, 3, "large messages should split into multiple batches");
assert.equal(batches.flat().length, messages.length, "splitting should preserve all messages");

console.log("summarization-budget validation passed");
