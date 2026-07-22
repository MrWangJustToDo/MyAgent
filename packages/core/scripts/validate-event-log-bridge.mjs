/**
 * Validates Event→Log bridge policy and routing.
 *
 * Run: pnpm --filter @my-agent/core run validate:event-log-bridge
 */

import assert from "node:assert/strict";

import { AgentEventBus, attachEventLogBridge, AgentLog } from "../dist/dev.mjs";

const log = new AgentLog();
const bus = new AgentEventBus();

attachEventLogBridge(bus, () => log);

bus.emit({
  type: "session:doc",
  agentId: "agent-1",
  data: { message: "Loaded instructions from AGENTS.md (1.0 KB)" },
});

const docEntry = log.getEntries().find((entry) => entry.category === "system");
assert.ok(docEntry);
assert.match(docEntry.message, /AGENTS\.md/);

bus.emit({
  type: "agent:tool-start",
  agentId: "agent-1",
  data: { tool_name: "read_file" },
});

const toolEntry = log.getEntries().find((entry) => entry.category === "tool");
assert.ok(toolEntry);
assert.match(toolEntry.message, /read_file/);

bus.emit({
  type: "memory:prefetch",
  agentId: "agent-1",
  data: { status: "injected", count: 2, filenames: ["a.md", "b.md"] },
});

const memoryEntry = log.getEntries().find((entry) => entry.category === "memory" && entry.level === "debug");
assert.ok(memoryEntry);
assert.match(memoryEntry.message, /Memory prefetch: 2/);

bus.emit({
  type: "subagent:completed",
  agentId: "sub-1",
  parentId: "agent-1",
  data: { subagentId: "sub-1", summary: "Found the test framework" },
});

const subagentEntry = log.getEntries().find((entry) => entry.message.includes("Subagent completed"));
assert.ok(subagentEntry);
assert.match(subagentEntry.message, /Found the test framework/);
assert.ok(!subagentEntry.message.includes("(no summary)"));

bus.emit({
  type: "agent:tool-approval-request",
  agentId: "agent-1",
  data: { tool_name: "run_command", tool_call_id: "tc-1", approval_id: "ap-1" },
});

const approvalEntries = log.getEntries().filter((entry) => entry.category === "approval");
assert.equal(approvalEntries.length, 1);
assert.match(approvalEntries[0].message, /run_command/);

console.log("event-log-bridge validation passed");
