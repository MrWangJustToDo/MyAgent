/**
 * Validates that the *active on-disk session* is observable through the session
 * protocol (audit gap #1):
 * - `AgentL1State.sessionId` / `AgentSessionSnapshot.sessionId` reflect the live
 *   disk session while the agent id stays stable.
 * - `session.resume` and `session.new` re-emit the retained `state` channel, so a
 *   live subscriber sees the switch (not just the command caller).
 *
 * Run: pnpm --filter @my-agent/core run validate:session-identity
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentManager, createLocalAgentSessionHost, registerCoreEnv } from "../dist/index.mjs";

// ============================================================================
// Mock CoreEnv (real fs under a temp root, mirroring native-fs path handling)
// ============================================================================

const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "session-identity-"));
const toAbs = (p) => (path.isAbsolute(p) ? p : path.join(rootPath, p));

registerCoreEnv({
  rootPath,
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
  homedir: async () => rootPath,
  fs: {
    readFile: async (p, encoding) => fs.promises.readFile(toAbs(p), encoding ?? "utf-8"),
    writeFile: async (p, content) => fs.promises.writeFile(toAbs(p), content),
    appendFile: async (p, content) => fs.promises.appendFile(toAbs(p), content, "utf8"),
    mkdir: async (p) => fs.promises.mkdir(toAbs(p), { recursive: true }),
    exists: async (p) =>
      fs.promises.access(toAbs(p)).then(
        () => true,
        () => false
      ),
    readdir: async (p) => {
      try {
        const entries = await fs.promises.readdir(toAbs(p), { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      const st = await fs.promises.stat(toAbs(p));
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(toAbs(p), { recursive: true, force: true }),
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => new Response(),
});

// ============================================================================
// Harness
// ============================================================================

const manager = new AgentManager();
const host = createLocalAgentSessionHost({ manager });
const created = await host.create({ name: "identity-test", model: "test-model" });
const session = created.session;
const agentId = session.getSnapshot().agentId;
const managed = manager.getAgent(agentId);
assert.ok(managed, "managed agent must exist");

// Live subscriber on the retained state channel.
const seenSessionIds = [];
session.subscribe(
  (event) => {
    if (event.channel === "state") seenSessionIds.push(event.payload.sessionId);
  },
  { channels: ["state"] }
);

const assertIdentity = (expected, label) => {
  assert.equal(session.getSnapshot().sessionId, expected, `${label}: snapshot.sessionId`);
  assert.equal(managed.getL1State().sessionId, expected, `${label}: L1 sessionId`);
  assert.equal(seenSessionIds.at(-1), expected, `${label}: live state broadcast`);
  assert.equal(session.getSnapshot().agentId, agentId, `${label}: agent identity unchanged`);
};

// ----------------------------------------------------------------------------
// 1. Fresh session is observable from the start
// ----------------------------------------------------------------------------

const first = session.getSnapshot().sessionId;
assert.ok(first?.startsWith("ses_"), "fresh session exposes its disk session id");
assertIdentity(first, "fresh");

// ----------------------------------------------------------------------------
// 2. `session.resume` swaps the disk session and broadcasts it
// ----------------------------------------------------------------------------

const store = managed.getSessionStore();
assert.ok(store, "session store available");
const target = store.create({ modelStyle: "openai", model: "test-model" });
target.name = "Resumed Target";
await store.save(target);

const resume = await session.dispatch({ type: "session.resume", sessionId: target.id });
assert.equal(resume.ok, true, "session.resume succeeds");
assert.notEqual(target.id, first, "resume targets a different disk session");
assertIdentity(target.id, "resume");
assert.equal(managed.name, "Resumed Target", "resume mirrors the restored display name");

// ----------------------------------------------------------------------------
// 3. `session.new` swaps it again and broadcasts
// ----------------------------------------------------------------------------

const newSession = await session.dispatch({ type: "session.new" });
assert.equal(newSession.ok, true, "session.new succeeds");
const nextId = newSession.data.sessionId;
assert.notEqual(nextId, target.id, "session.new allocates a new disk session");
assertIdentity(nextId, "session.new");

await fs.promises.rm(rootPath, { recursive: true, force: true });
console.log("session-identity validation passed");
