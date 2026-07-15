/**
 * Validates reactive compaction helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:reactive-compact
 */

import assert from "node:assert/strict";

import { isPromptTooLongError, extractRunErrorMessage } from "../dist/dev.mjs";

assert.equal(isPromptTooLongError(new Error("prompt_too_long")), true);
assert.equal(isPromptTooLongError(new Error("context length exceeded")), true);
assert.equal(isPromptTooLongError(new Error("network timeout")), false);

assert.equal(extractRunErrorMessage({ type: "TEXT_MESSAGE_CONTENT", delta: "hi" }), "");
assert.equal(
  extractRunErrorMessage({ type: "RUN_ERROR", message: "prompt_too_long: request too large" }),
  "prompt_too_long: request too large"
);
assert.equal(extractRunErrorMessage({ type: "RUN_ERROR", error: { message: "too many tokens" } }), "too many tokens");

console.log("reactive-compact validation passed");
