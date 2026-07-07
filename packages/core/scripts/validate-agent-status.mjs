/**
 * Validates agent status helpers and ManagedAgent lifecycle ownership.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-status
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, ManagedAgent, resolveFinishStatus } from "../dist/dev.mjs";

assert.equal(isTerminalStatus("aborted"), true);
assert.equal(isTerminalStatus("waiting"), true);
assert.equal(isTerminalStatus("running"), false);

assert.equal(isActiveStatus("thinking"), true);
assert.equal(isActiveStatus("completed"), false);
assert.equal(ACTIVE_STATUSES.has("compacting"), true);

assert.equal(resolveFinishStatus("aborted", ""), "aborted");
assert.equal(resolveFinishStatus("waiting", "oops"), "waiting");
assert.equal(resolveFinishStatus("running", "failed"), "error");
assert.equal(resolveFinishStatus("responding", ""), "completed");

const managed = new ManagedAgent(
  { name: "test", model: "gpt-4" },
  {
    context: { getMessages: () => [], reset: () => {}, setMessages: () => {}, getMessagesForLLM: () => [] },
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, agent: () => {}, clear: () => {} },
    tools: {},
    todoManager: null,
  }
);

assert.equal(managed.status, "idle");
managed.setStatus("running");
assert.equal(managed.status, "running");

console.log("agent-status validation passed");
