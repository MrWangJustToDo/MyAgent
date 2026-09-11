/**
 * Validates SessionStore durability/lifecycle on the append-only message log:
 *
 * #1 no-op save dedupe: the content signature is compared BEFORE stamping
 *    `updatedAt`, so re-saving an unchanged session performs zero disk IO and
 *    does not advance `updatedAt`. A changed save appends again.
 *
 * #2 a session written by a previous process (log only, no snapshot) loads via
 *    folding, is listed, and `delete()` removes it so `load()` does not
 *    resurrect it.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-store-lifecycle
 */

import assert from "node:assert/strict";
import { join } from "node:path";

import { clearCoreEnv, registerCoreEnv, SessionStore } from "../dist/dev.mjs";

const SESSION_DIR = ".agents/sessions";

const files = new Map();
const counts = { writeFile: 0, appendFile: 0, remove: 0, mkdir: 0 };

function setupEnv() {
  clearCoreEnv();
  files.clear();
  counts.writeFile = 0;
  counts.appendFile = 0;
  counts.remove = 0;
  counts.mkdir = 0;

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
        counts.writeFile += 1;
        files.set(p, typeof content === "string" ? content : String(content));
      },
      async appendFile(p, content) {
        counts.appendFile += 1;
        const prev = files.get(p) ?? "";
        files.set(p, prev + (typeof content === "string" ? content : String(content)));
      },
      async mkdir() {
        counts.mkdir += 1;
      },
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
        return [...names].map((name) => ({ name, type: name.endsWith(".session.jsonl") ? "file" : "directory" }));
      },
      async remove(p) {
        counts.remove += 1;
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

// --- #1: no-op save is a true no-op -----------------------------------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "test-model", name: "dedupe" });
  session.uiMessages = [{ id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] }];
  const logPath = `${SESSION_DIR}/${session.id}.session.jsonl`;

  await store.save(session);
  assert.ok(counts.appendFile >= 1, "first save appends the log");

  const afterFirst = { ...counts };
  const logAfterFirst = files.get(logPath);
  const updatedAtAfterFirst = session.updatedAt;

  // Re-save the SAME object with no changes.
  await store.save(session);

  assert.deepEqual(
    { writeFile: counts.writeFile, appendFile: counts.appendFile, remove: counts.remove, mkdir: counts.mkdir },
    {
      writeFile: afterFirst.writeFile,
      appendFile: afterFirst.appendFile,
      remove: afterFirst.remove,
      mkdir: afterFirst.mkdir,
    },
    "unchanged save performs no disk IO"
  );
  assert.equal(files.get(logPath), logAfterFirst, "log bytes unchanged on no-op save");
  assert.equal(session.updatedAt, updatedAtAfterFirst, "updatedAt not bumped on no-op save");

  // A real content change must still persist (and bump updatedAt).
  session.name = "renamed";
  await store.save(session);
  assert.ok(counts.appendFile > afterFirst.appendFile, "changed save appends again");
  assert.notEqual(files.get(logPath), logAfterFirst, "changed save writes new bytes");
  assert.ok(session.updatedAt >= updatedAtAfterFirst, "changed save stamps updatedAt");
}

// --- #2: log-only session loads, lists, and deletes -------------------------

setupEnv();
{
  const writer = new SessionStore();
  const session = writer.create({ modelStyle: "openai", model: "test-model", name: "restart" });
  session.uiMessages = [
    { id: "u1", role: "user", parts: [{ type: "text", content: "hello" }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", content: "hi there" }] },
  ];
  await writer.save(session);

  const logPath = `${SESSION_DIR}/${session.id}.session.jsonl`;
  assert.ok(files.has(logPath), "log exists");

  // A fresh store (new process) loads by folding the log.
  const reader = new SessionStore();
  const loaded = await reader.load(session.id);
  assert.ok(loaded, "log-only session loads");
  assert.equal(loaded.name, "restart");
  assert.deepEqual(
    loaded.uiMessages.map((m) => m.id),
    ["u1", "a1"],
    "messages folded in order"
  );

  const metas = await reader.list();
  assert.ok(
    metas.some((m) => m.id === session.id),
    "log-only session is listed"
  );

  assert.equal(await reader.delete(session.id), true, "delete() removes the log");
  assert.equal(files.has(logPath), false, "log removed");
  assert.equal(await reader.load(session.id), null, "deleted session does not resurrect");
  assert.equal(await reader.delete(session.id), false, "delete() of a missing session returns false");
}

console.log("session-store-lifecycle validation passed");
