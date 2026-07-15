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

const memoryEntry = log.getEntries().find((entry) => entry.category === "memory" && entry.level === "info");
assert.ok(memoryEntry);
assert.match(memoryEntry.message, /Injected 2/);

console.log("event-log-bridge validation passed");
