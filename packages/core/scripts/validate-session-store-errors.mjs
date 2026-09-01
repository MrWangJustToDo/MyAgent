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
      async readdir() {
        return [];
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

console.log("session-store-errors validation passed");
