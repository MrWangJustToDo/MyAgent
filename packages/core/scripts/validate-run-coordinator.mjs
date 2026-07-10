/**
 * Validates RunCoordinator message prep and abort error detection.
 *
 * Run: pnpm --filter @my-agent/core run validate:run-coordinator
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { RunCoordinator } from "../dist/dev.mjs";

const coordinator = new RunCoordinator();

assert.deepEqual(coordinator.prepareMessages({ prompt: "hi" }), [{ role: "user", content: "hi" }]);
assert.deepEqual(coordinator.prepareMessages({ messages: [{ role: "user", content: "a" }] }).length, 1);
assert.equal(coordinator.isAbortError(new DOMException("aborted", "AbortError")), true);
assert.equal(coordinator.isAbortError(new Error("network timeout")), false);
assert.equal(coordinator.canRetryReactiveCompact(), true);

console.log("run-coordinator validation passed");
