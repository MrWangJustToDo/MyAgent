/**
 * SessionStore.save must reject on IO failure so SessionService can emit
 * `session:save-error`. The per-session lock chain must stay healthy after a
 * failure so later saves still run.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-store-errors
 */

import assert from "node:assert/strict";
import { join } from "node:path";

import { clearCoreEnv, registerCoreEnv, SessionStore } from "../dist/dev.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const files = new Map();
let failWrites = false;

function setupEnv() {
  clearCoreEnv();
  files.clear();
  failWrites = false;

  registerCoreEnv({
    rootPath: "/mock",
    getPlatform: async () => "linux",
    getArch: async () => "arm64",
    getEnv: async () => ({}),
    homedir: async () => "/mock",
    path: {
      join: (...parts) => parts.join("/"),
      dirname: (p) => {
        const i = p.lastIndexOf("/");
        return i <= 0 ? "/" : p.slice(0, i);
      },
      basename: (p, ext) => {
        const base = p.split("/").pop() ?? p;
        return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      },
      extname: (p) => {
        const base = p.split("/").pop() ?? p;
        const i = base.lastIndexOf(".");
        return i < 0 ? "" : base.slice(i);
      },
      resolve: (...parts) => join("/", ...parts),
      normalize: (p) => p.replace(/\/+/g, "/"),
      isAbsolute: (p) => p.startsWith("/"),
      getSep: () => "/",
      parse: (p) => {
        const base = p.split("/").pop() ?? p;
        const i = base.lastIndexOf(".");
        return {
          root: "/",
          dir: p.slice(0, p.lastIndexOf("/")) || "/",
          base,
          ext: i < 0 ? "" : base.slice(i),
          name: i < 0 ? base : base.slice(0, i),
        };
      },
    },
    fs: {
      async readFile(p) {
        const content = files.get(p);
        if (content === undefined) throw new Error(`ENOENT: ${p}`);
        return content;
      },
      async writeFile(p, content) {
        if (failWrites) throw new Error("ENOSPC: mock disk full");
        files.set(p, typeof content === "string" ? content : String(content));
      },
      async appendFile(p, content) {
        if (failWrites) throw new Error("ENOSPC: mock disk full");
        const prev = files.get(p) ?? "";
        files.set(p, prev + (typeof content === "string" ? content : String(content)));
      },
      async mkdir() {},
      async exists(p) {
        if (files.has(p)) return true;
        const prefix = p.endsWith("/") ? p : `${p}/`;
        return [...files.keys()].some((k) => k === p || k.startsWith(prefix));
      },
      async readdir(p) {
        const prefix = p.endsWith("/") ? p : `${p}/`;
        const names = new Set();
        for (const key of files.keys()) {
          if (key.startsWith(prefix)) {
            const rest = key.slice(prefix.length);
            const name = rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : rest;
            if (name) names.add(name);
          }
        }
        return [...names].map((name) => ({ name, type: name.endsWith(".session.json") ? "file" : "directory" }));
      },
      async remove(p) {
        files.delete(p);
      },
      async stat(p) {
        if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
        return { size: String(files.get(p)).length, isFile: true, isDirectory: false };
      },
    },
    runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    fetch: async () => new Response("", { status: 200 }),
  });
}

setupEnv();
const store = new SessionStore();
const session = store.create({ modelStyle: "openai", model: "test-model", name: "t1" });

failWrites = true;
await assert.rejects(() => store.save(session), /ENOSPC|disk full/, "save() must reject when IO fails");

failWrites = false;
session.name = "after-failure";
await store.save(session);
const loaded = await store.load(session.id);
assert.ok(loaded, "save after failure must still work (lock chain healthy)");
assert.equal(loaded.name, "after-failure");

// ----------------------------------------------------------------------------
// getLatestEmpty: only sessions without user messages are reusable, and the
// most recently updated one wins (drives empty-session reuse on startup).
// ----------------------------------------------------------------------------
{
  const oldEmpty = store.create({ modelStyle: "openai", model: "m", name: "old-empty" });
  await store.save(oldEmpty);
  await sleep(3);

  const used = store.create({ modelStyle: "openai", model: "m", name: "used" });
  used.uiMessages = [{ id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] }];
  await store.save(used);
  await sleep(3);

  const newEmpty = store.create({ modelStyle: "openai", model: "m", name: "new-empty" });
  await store.save(newEmpty);

  const reusable = await store.getLatestEmpty();
  assert.ok(reusable, "must find a reusable empty session");
  assert.equal(reusable.id, newEmpty.id, "most recently updated empty session wins");
  assert.equal(reusable.uiMessages.length, 0);

  // A session that has user messages is never returned.
  const onlyUsed = await store.getLatestEmpty();
  assert.notEqual(onlyUsed.id, used.id);
}

console.log("session-store-errors validation passed");
