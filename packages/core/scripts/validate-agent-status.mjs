/**
 * Validates agent status helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-status
 */
/* eslint-disable no-undef, import/no-useless-path-segments */
import assert from "node:assert/strict";

import { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, resolveFinishStatus } from "../dist/index.mjs";

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

console.log("agent-status validation passed");
