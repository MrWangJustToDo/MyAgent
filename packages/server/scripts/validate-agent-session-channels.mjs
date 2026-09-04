/**
 * End-to-end validation of the remote-session incremental channels.
 *
 * Boots the real Hono server on an ephemeral port, creates a real agent via
 * the remote host, then dispatches state-mutating commands and asserts the new
 * protocol-level channels (`extensions` / `mcp` / `mode`) are delivered and the
 * RemoteSessionClient's cached snapshot fields flip accordingly — without a
 * snapshot refetch.
 *
 * Note: post-command events are emitted once, at dispatch time, and are not
 * replayed to subscribers who connect afterwards — so each subscription waits
 * for an initial `state` event before dispatching, to ensure its SSE stream is
 * live.
 *
 * Run: pnpm --filter @my-agent/server run validate:agent-session-channels
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ROOT_PATH = mkdtempSync(join(tmpdir(), "agent-session-channels-"));
process.env.SERVER_PORT = "0";
process.env.SANDBOX_ENV = "native";

const { createServer } = await import("../dist/index.mjs");
const { createRemoteAgentSessionHost } = await import("../dist/remote-session-host.mjs");
const { RemoteSessionClient } = await import("../dist/remote-session-client.mjs");

const waitFor = async (label, fn, timeoutMs = 6000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timeout waiting for ${label}`);
};

const server = createServer();
await new Promise((resolve) => setTimeout(resolve, 400));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
assert.ok(port > 0);
const baseUrl = `http://127.0.0.1:${port}`;

const host = createRemoteAgentSessionHost({ baseUrl });
const { session } = await host.create({
  name: "channels-agent",
  model: process.env.MODEL || "test-model",
});

// ── 1. mcp.refresh → mcp event + snapshot.mcp present ──
const seen = new Set();
const unsub = session.subscribe(
  (event) => {
    seen.add(event.channel);
  },
  { channels: ["mcp", "mode", "extensions", "state"] }
);
await waitFor("SSE live (initial state)", () => seen.has("state"));

const mcpRes = await session.dispatch({ type: "mcp.refresh" });
assert.equal(mcpRes.ok, true, `mcp.refresh ok: ${JSON.stringify(mcpRes)}`);
await waitFor("mcp event", () => seen.has("mcp"));
assert.ok(Array.isArray(session.getSnapshot().mcp.servers), "snapshot.mcp.servers must be an array");

// ── 2. auto.toggle → mode event + snapshot.autoMode flips ──
const beforeAuto = session.getSnapshot().autoMode;
const autoRes = await session.dispatch({ type: "auto.toggle" });
assert.equal(autoRes.ok, true);
await waitFor("mode event + autoMode flip", () => seen.has("mode") && session.getSnapshot().autoMode !== beforeAuto);

// ── 3. plan.enable → mode === "plan" ──
const planOn = await session.dispatch({ type: "plan.enable" });
assert.equal(planOn.ok, true);
await waitFor("snapshot.mode === plan", () => session.getSnapshot().mode === "plan");

// ── 4. plan.disable → mode === "normal" ──
const planOff = await session.dispatch({ type: "plan.disable" });
assert.equal(planOff.ok, true);
await waitFor("snapshot.mode === normal", () => session.getSnapshot().mode === "normal");

// ── 5. extension.toggle → extensions event + snapshot.extensions flip ──
const extensions = session.getSnapshot().extensions?.extensions ?? [];
if (extensions.length > 0) {
  const first = extensions[0];
  const target = !first.enabled;
  const extRes = await session.dispatch({ type: "extension.toggle", id: first.id, enabled: target });
  assert.equal(extRes.ok, true, `extension.toggle ok: ${JSON.stringify(extRes)}`);
  await waitFor("extensions event", () => seen.has("extensions"));
  await waitFor(
    `snapshot.extensions[${first.id}].enabled === ${target}`,
    () => session.getSnapshot().extensions.extensions.find((e) => e.id === first.id)?.enabled === target
  );
  // restore original state
  await session.dispatch({ type: "extension.toggle", id: first.id, enabled: first.enabled });
} else {
  console.log("(no extensions loaded on temp root; skipping extension.toggle branch)");
}

// ── 6. Channel filtering: a state-only subscriber must not see mode events ──
const stateOnlyChannels = [];
const stateOnly = session.subscribe(
  (event) => {
    stateOnlyChannels.push(event.channel);
  },
  { channels: ["state"] }
);
await waitFor("state-only SSE live", () => stateOnlyChannels.length > 0);
await session.dispatch({ type: "auto.toggle" }); // emits a mode event
await new Promise((resolve) => setTimeout(resolve, 200));
assert.ok(!stateOnlyChannels.includes("mode"), "state-only subscriber must not receive mode events");
stateOnly();

// ── 7. Unsubscribe stops delivery ──
let postUnsub = 0;
const temp = session.subscribe(
  () => {
    postUnsub += 1;
  },
  { channels: ["mode", "state"] }
);
await waitFor("temp SSE live", () => postUnsub > 0); // initial state event proves the stream is live
temp();
const countAfterUnsub = postUnsub;
await session.dispatch({ type: "auto.toggle" });
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(postUnsub, countAfterUnsub, "unsubscribed handler must not receive events");

// ── 8. RemoteSessionClient applies the new channels onto its cached snapshot ──
{
  const client = new RemoteSessionClient({ baseUrl, agentId: session.getSnapshot().agentId });
  const clientSeen = new Set();
  const clientUnsub = client.subscribe(
    (event) => {
      clientSeen.add(event.channel);
    },
    { channels: ["mode", "state"] }
  );
  await waitFor("client SSE live", () => clientSeen.has("state"));
  const before = client.getSnapshot().autoMode;
  await session.dispatch({ type: "auto.toggle" });
  await waitFor("client snapshot autoMode flip", () => client.getSnapshot().autoMode !== before);
  assert.ok(
    ["normal", "plan", "auto"].includes(client.getSnapshot().mode),
    `mode valid (got ${client.getSnapshot().mode})`
  );
  clientUnsub();
}

unsub();
await host.destroy(session.getSnapshot().agentId);
server.close();
rmSync(process.env.ROOT_PATH, { recursive: true, force: true });
console.log("agent-session-channels validation passed");
process.exit(0);
