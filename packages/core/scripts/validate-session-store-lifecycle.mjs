/**
 * Validates two SessionStore durability/lifecycle fixes:
 *
 * #1 no-op save dedupe: the content fingerprint is compared BEFORE stamping
 *    `updatedAt`, so re-saving an unchanged session performs zero disk IO and
 *    does not advance `updatedAt`.
 *
 * #2 journal-only sessions (crash between the journal append and the snapshot
 *    write) are treated as existing by `delete()` — both files are removed — so
 *    a later `load()` no longer resurrects a deleted session.
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
        return [...names].map((name) => ({ name, type: name.endsWith(".session.json") ? "file" : "directory" }));
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
  const snapshotPath = `${SESSION_DIR}/${session.id}.session.json`;

  await store.save(session);
  assert.ok(counts.writeFile >= 1, "first save writes the snapshot");
  assert.ok(counts.appendFile >= 1, "first save appends the journal");

  const afterFirst = { ...counts };
  const snapshotAfterFirst = files.get(snapshotPath);
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
  assert.equal(files.get(snapshotPath), snapshotAfterFirst, "snapshot bytes unchanged on no-op save");
  assert.equal(session.updatedAt, updatedAtAfterFirst, "updatedAt not bumped on no-op save");

  // A real content change must still persist (and bump updatedAt).
  session.name = "renamed";
  await store.save(session);
  assert.ok(counts.appendFile > afterFirst.appendFile, "changed save appends again");
  assert.notEqual(files.get(snapshotPath), snapshotAfterFirst, "changed save rewrites the snapshot");
  assert.ok(session.updatedAt >= updatedAtAfterFirst, "changed save stamps updatedAt");
}

// --- #2: journal-only session is deletable and stays deleted -----------------

setupEnv();
{
  const id = "ses_journalonly";
  const journalPath = `${SESSION_DIR}/${id}.session.log`;
  const snapshotPath = `${SESSION_DIR}/${id}.session.json`;
  const data = {
    id,
    name: "crashed",
    version: 5,
    modelStyle: "openai",
    model: "test-model",
    createdAt: 1,
    updatedAt: 2,
    usage: {},
    todos: [],
    uiMessages: [{ id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] }],
    journalSeq: 1,
  };
  const record = { v: 1, seq: 1, kind: "checkpoint", ts: 2, data };
  files.set(journalPath, JSON.stringify(record) + "\n");

  const store = new SessionStore();

  // load() sees the journal-only session (resurrect source of the bug).
  const loaded = await store.load(id);
  assert.ok(loaded && loaded.name === "crashed", "journal-only session loads via the journal");

  // list() does not surface it (metadata scan only sees snapshots) — documents
  // the known limitation that getLatest/getLatestEmpty also miss it.
  const metas = await store.list();
  assert.equal(
    metas.some((m) => m.id === id),
    false,
    "journal-only session is absent from list()"
  );

  // delete() must remove the journal-only session.
  assert.equal(await store.delete(id), true, "delete() removes a journal-only session");
  assert.equal(files.has(journalPath), false, "journal removed");
  assert.equal(files.has(snapshotPath), false, "snapshot absent");
  assert.equal(await store.load(id), null, "deleted session does not resurrect");

  // Deleting a non-existent session is a no-op.
  assert.equal(await store.delete(id), false, "delete() of a missing session returns false");
}

// --- #2b: snapshot + journal are both cleaned --------------------------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "test-model", name: "both" });
  await store.save(session);
  const journalPath = `${SESSION_DIR}/${session.id}.session.log`;
  const snapshotPath = `${SESSION_DIR}/${session.id}.session.json`;
  assert.ok(files.has(journalPath) && files.has(snapshotPath));

  assert.equal(await store.delete(session.id), true);
  assert.equal(files.has(journalPath), false, "journal removed alongside snapshot");
  assert.equal(files.has(snapshotPath), false, "snapshot removed");
  assert.equal(await store.load(session.id), null);
}

console.log("session-store-lifecycle validation passed");
