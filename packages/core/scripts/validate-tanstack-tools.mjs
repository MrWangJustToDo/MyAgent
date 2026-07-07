/**
 * Validates TanStack tool bridging and subagent read-only subsets.
 *
 * Run: pnpm --filter @my-agent/core run validate:tanstack-tools
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  createHooksMiddleware,
  createTanStackSubagentTools,
  createTanStackTools,
  getReadOnlyTanStackToolNames,
} from "../dist/dev.mjs";

const readOnlyNames = getReadOnlyTanStackToolNames();
assert.deepEqual(readOnlyNames, ["read_file", "glob", "grep", "list_file", "tree"]);

const baseTools = await createTanStackTools();
const baseNames = baseTools.map((t) => t.name).sort();
assert.ok(baseNames.includes("read_file"));
assert.ok(baseNames.includes("run_command"));
assert.ok(baseNames.includes("glob"));

const subagentTools = createTanStackSubagentTools();
const subagentNames = new Set(subagentTools.map((t) => t.name));
for (const name of readOnlyNames) {
  assert.ok(subagentNames.has(name), `missing subagent tool: ${name}`);
}
assert.ok(!subagentNames.has("run_command"));
assert.ok(!subagentNames.has("write_file"));
assert.ok(!subagentNames.has("task"));

const runCommand = baseTools.find((t) => t.name === "run_command");
assert.ok(runCommand, "run_command tool missing");
assert.equal(runCommand.needsApproval, true);
assert.equal(runCommand.__toolSide, "server");

const hooks = createHooksMiddleware({
  getHookRegistry: () => null,
  getSessionId: () => "session-1",
  log: null,
});
assert.equal(hooks.name, "hooks");
assert.equal(typeof hooks.onBeforeToolCall, "function");
assert.equal(typeof hooks.onAfterToolCall, "function");

console.log("tanstack-tools validation passed");
