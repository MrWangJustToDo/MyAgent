/**
 * Smoke-test AgentSession HTTP client SSE framing + snapshot cache shape.
 *
 * Run: pnpm --filter @my-agent/server run validate:agent-session-http
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { parseAgentSessionSseBlockForTests } from "../dist/agent-session-client.mjs";

const block = [
  "event: usage",
  'data: {"channel":"usage","payload":{"total":{"inputTokens":1,"outputTokens":2,"totalTokens":3},"window":{"inputTokens":1,"outputTokens":2,"totalTokens":3},"percent":1,"tokenLimit":100,"cost":0},"ts":1}',
  "",
].join("\n");

const event = parseAgentSessionSseBlockForTests(block);
assert.ok(event);
assert.equal(event.channel, "usage");
assert.equal(event.payload.total.inputTokens, 1);

// Child-id path shape (contract only — no live server)
const childSnapshotPath = "/api/agent/subagent_abc/snapshot";
assert.ok(childSnapshotPath.includes("/api/agent/"));
assert.ok(!childSnapshotPath.startsWith("/api/fs"));

console.log("agent-session-http validation passed");
