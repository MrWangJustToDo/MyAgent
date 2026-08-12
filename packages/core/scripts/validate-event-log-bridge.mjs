/**
 * Validates Event→Log bridge policy and routing.
 *
 * Run: pnpm --filter @my-agent/core run validate:event-log-bridge
 */

import assert from "node:assert/strict";

import { AgentTelemetryBus, bridgeTelemetryToAgentLog, AgentLog } from "../dist/dev.mjs";

const log = new AgentLog();
const bus = new AgentTelemetryBus();

bridgeTelemetryToAgentLog(bus, () => log);

bus.emit({
  type: "session:doc",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { message: "Loaded instructions from AGENTS.md (1.0 KB)" },
});

const docEntry = log.getEntries().find((entry) => entry.category === "system");
assert.ok(docEntry);
assert.match(docEntry.message, /AGENTS\.md/);

bus.emit({
  type: "agent:tool-start",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { tool_name: "read_file" },
});

const toolEntry = log.getEntries().find((entry) => entry.category === "tool");
assert.ok(toolEntry);
assert.match(toolEntry.message, /read_file/);

bus.emit({
  type: "memory:prefetch",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { status: "injected", count: 2, filenames: ["a.md", "b.md"] },
});

const memoryEntry = log.getEntries().find((entry) => entry.category === "memory" && entry.level === "debug");
assert.ok(memoryEntry);
assert.match(memoryEntry.message, /Memory prefetch: 2/);

bus.emit({
  type: "subagent:completed",
  ts: Date.now(),
  agentId: "sub-1",
  parentId: "agent-1",
  payload: { subagentId: "sub-1", summary: "Found the test framework" },
});

const subagentEntry = log.getEntries().find((entry) => entry.message.includes("Subagent completed"));
assert.ok(subagentEntry);
assert.match(subagentEntry.message, /Found the test framework/);
assert.ok(!subagentEntry.message.includes("(no summary)"));

bus.emit({
  type: "agent:tool-approval-request",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { tool_name: "run_command", tool_call_id: "tc-1", approval_id: "ap-1" },
});

const approvalEntries = log.getEntries().filter((entry) => entry.category === "approval");
assert.equal(approvalEntries.length, 1);
assert.match(approvalEntries[0].message, /run_command/);

bus.emit({
  type: "compaction:reactive-complete",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { originalCount: 40, compactedCount: 12, tokensBefore: 9000, tokensAfter: 2100 },
});

const reactiveEntry = log.getEntries().find((entry) => entry.message.includes("Reactive compact:"));
assert.ok(reactiveEntry);
assert.match(reactiveEntry.message, /40→12 messages/);
assert.match(reactiveEntry.message, /9000→2100 tokens/);
assert.ok(!reactiveEntry.message.includes("?→?"));

console.log("event-log-bridge validation passed");
