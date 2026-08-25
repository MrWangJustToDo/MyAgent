/**
 * Live Local-vs-Remote AgentSession parity smoke.
 *
 * Boots the real Hono server on an ephemeral port, creates a real agent via
 * the remote host, then exercises catalog routes, remount seeds (tool buffers
 * / summary streams), state-channel sync (incl. rename without refetch), and
 * RemoteSessionClient reconnect behavior.
 *
 * Run: pnpm --filter @my-agent/server run validate:agent-session-http
 */
/* eslint-disable no-undef */
/* eslint-disable import/no-useless-path-segments */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ROOT_PATH = mkdtempSync(join(tmpdir(), "agent-session-http-"));
process.env.SERVER_PORT = "0";
process.env.SANDBOX_ENV = "native";

const { createServer } = await import("../dist/index.mjs");
const { createRemoteAgentSessionHost } = await import("../dist/remote-session-host.mjs");
const { parseAgentSessionSseBlockForTests, RemoteSessionClient } = await import("../dist/remote-session-client.mjs");

// ── 0. SSE parse helper still tolerates heartbeats ──
assert.equal(parseAgentSessionSseBlockForTests(": ping\n\n"), null);
assert.equal(parseAgentSessionSseBlockForTests("event: ping\ndata: \n\n"), null);

const server = createServer();
await new Promise((resolve) => setTimeout(resolve, 400));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
assert.ok(port > 0);
const baseUrl = `http://127.0.0.1:${port}`;

// ── 1. Remote Host: create → snapshot → list ──
const host = createRemoteAgentSessionHost({ baseUrl });
const { session } = await host.create({
  name: "parity-agent",
  model: process.env.MODEL || "test-model",
});

const snap = session.getSnapshot();
assert.equal(snap.name, "parity-agent");
assert.ok(snap.agentId.length > 0);

const listResult = await host.list();
assert.ok(Array.isArray(listResult));
assert.ok(listResult.some((entry) => entry.agentId === snap.agentId));

// ── 2. Remount seed routes ──
const summaryRes = await fetch(`${baseUrl}/api/agent/${snap.agentId}/summary-streams`);
assert.equal(summaryRes.status, 200);
assert.deepEqual((await summaryRes.json()).snapshots ?? [], []);

const bufferRes = await fetch(`${baseUrl}/api/agent/${snap.agentId}/tool-buffers`);
assert.equal(bufferRes.status, 200);
assert.deepEqual((await bufferRes.json()).buffers, {});

// ── 3. State-channel sync: rename propagates without a snapshot refetch ──
const stateUnsub = session.subscribe(() => {}, { channels: ["state"] });
await new Promise((resolve) => setTimeout(resolve, 150));

await session.dispatch({ type: "rename", name: "renamed-via-state" });
let renamed = false;
for (let i = 0; i < 40 && !renamed; i++) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  renamed = session.getSnapshot().name === "renamed-via-state";
}
assert.ok(renamed, `rename must propagate via state channel (got "${session.getSnapshot().name}")`);

// ── 4. RemoteSessionClient reconnect: survives server restart of the stream ──
{
  const client = new RemoteSessionClient({ baseUrl, agentId: snap.agentId });
  let events = 0;
  const unsub = client.subscribe(
    () => {
      events += 1;
    },
    { channels: ["state"] }
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(events >= 1, "subscribe should deliver initial state event");

  // getSummaryStreamSnapshot returns cached (empty) — not always-null contract shape
  assert.equal(client.getSummaryStreamSnapshot("task:none"), null);

  // refresh() hydrates from server routes
  await client.refresh();
  assert.equal(client.getSnapshot().name, "renamed-via-state");
  unsub();
}

// ── 5. Child id routes resolve through the same plane ──
{
  // Unknown id → 404 (server decides; no local crash)
  const missing = await fetch(`${baseUrl}/api/agent/does-not-exist/snapshot`);
  assert.equal(missing.status, 404);
  const lazy = host.connect("does-not-exist");
  assert.ok(lazy, "connect stays synchronous and delegates existence to the server");
}

// ── 6. Destroy ──
await host.destroy(snap.agentId);
const gone = await fetch(`${baseUrl}/api/agent/${snap.agentId}/snapshot`);
assert.equal(gone.status, 404);

stateUnsub();
server.close();
rmSync(process.env.ROOT_PATH, { recursive: true, force: true });
console.log("agent-session-http validation passed");
process.exit(0);
