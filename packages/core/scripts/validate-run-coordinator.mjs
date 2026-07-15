/**
 * Validates RunCoordinator abort wiring and pending abort.
 *
 * Run: pnpm --filter @my-agent/core run validate:run-coordinator
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { AgentRunner, RunCoordinator } from "../dist/dev.mjs";

const coordinator = new RunCoordinator();

assert.equal(coordinator.isAbortError(new DOMException("aborted", "AbortError")), true);
assert.equal(coordinator.isAbortError(new Error("network timeout")), false);
assert.equal(coordinator.canRetryReactiveCompact(), true);

{
  let status = "running";
  coordinator.setupAbortController(undefined, {
    onAborted: () => {
      status = "aborted";
    },
  });
  const pending = new AbortController();
  coordinator.addPendingAbortController(pending);
  const runController = coordinator.currentAbortController;
  assert.ok(runController);

  // AgentRunner must reuse the RunCoordinator controller identity (main/subagent abort path).
  const chatController = AgentRunner.resolveAbortController({ abortController: runController });
  assert.equal(chatController, runController);

  coordinator.abort("user-cancelled");
  assert.equal(status, "aborted");
  assert.equal(runController.signal.aborted, true);
  assert.equal(pending.signal.aborted, true);
}

console.log("run-coordinator validation passed");
