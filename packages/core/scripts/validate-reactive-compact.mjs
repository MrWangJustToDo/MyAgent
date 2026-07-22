/**
 * Validates reactive compaction helpers and compaction start event kinds.
 *
 * Run: pnpm --filter @my-agent/core run validate:reactive-compact
 */

import assert from "node:assert/strict";

import { isPromptTooLongError, extractRunErrorMessage, createAgentStatusController } from "../dist/dev.mjs";

assert.equal(isPromptTooLongError(new Error("prompt_too_long")), true);
assert.equal(isPromptTooLongError(new Error("context length exceeded")), true);
assert.equal(isPromptTooLongError(new Error("network timeout")), false);

assert.equal(extractRunErrorMessage({ type: "TEXT_MESSAGE_CONTENT", delta: "hi" }), "");
assert.equal(
  extractRunErrorMessage({ type: "RUN_ERROR", message: "prompt_too_long: request too large" }),
  "prompt_too_long: request too large"
);
assert.equal(extractRunErrorMessage({ type: "RUN_ERROR", error: { message: "too many tokens" } }), "too many tokens");

const events = [];
let status = "running";

const statusController = createAgentStatusController({
  getStatus: () => status,
  setStatus: (next) => {
    status = next;
  },
  getError: () => "",
  setError: () => {},
  setPendingApprovalCount: () => {},
  emitEvent: (type, data) => events.push({ type, data }),
});

statusController.beginCompaction("auto");
assert.equal(status, "compacting");
assert.deepEqual(
  events.map((e) => e.type),
  ["compaction:auto-start"]
);

events.length = 0;
status = "running";
statusController.beginCompaction("reactive", { retry: 1, maxRetries: 1 });
assert.equal(status, "compacting");
assert.deepEqual(
  events.map((e) => e.type),
  ["compaction:reactive-start"]
);
assert.equal(events[0].data?.retry, 1);
assert.ok(!events.some((e) => e.type === "compaction:auto-start"));

console.log("reactive-compact validation passed");
