/**
 * Validates the append-only session message log (`{id}.session.jsonl`):
 *
 * - incremental append: only new/changed messages produce lines;
 * - fold on load equals the saved session;
 * - state-only change re-emits the last message line;
 * - no-op save appends nothing;
 * - non-empty → empty rewrites the file to a single `message: null` line;
 * - a rewrite goes through a temp file + rename when the env fs supports it
 *   (and falls back to an in-place write otherwise);
 * - an unprimed store rewrites instead of appending into an unknown log;
 * - approvals are derived from messages, with `approvalAt` preserved.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-message-log
 */

import assert from "node:assert/strict";
import { join } from "node:path";

import { clearCoreEnv, registerCoreEnv, SessionStore } from "../dist/dev.mjs";

const SESSION_DIR = ".agents/sessions";

const files = new Map();
const counts = { appendFile: 0, writeFile: 0, rename: 0 };

function setupEnv({ withAppend = true, withRename = true } = {}) {
  clearCoreEnv();
  files.clear();
  counts.appendFile = 0;
  counts.writeFile = 0;
  counts.rename = 0;

  const mockFs = {
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
      files.set(p, (files.get(p) ?? "") + (typeof content === "string" ? content : String(content)));
    },
    async rename(from, to) {
      counts.rename += 1;
      const content = files.get(from);
      if (content === undefined) throw new Error(`ENOENT: ${from}`);
      files.delete(from);
      files.set(to, content);
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
      return [...names].map((name) => ({ name, type: name.endsWith(".session.jsonl") ? "file" : "directory" }));
    },
    async remove(p) {
      files.delete(p);
    },
    async stat(p) {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return { size: String(files.get(p)).length, isFile: true, isDirectory: false };
    },
  };
  // Simulate a runtime whose fs lacks the optional `appendFile` primitive.
  if (!withAppend) delete mockFs.appendFile;
  // Simulate a runtime whose fs lacks the optional `rename` primitive (rewrites
  // then fall back to an in-place write).
  if (!withRename) delete mockFs.rename;

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
    fs: mockFs,
    runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    fetch: async () => new Response("", { status: 200 }),
  });
}

const userMessage = (id, text) => ({ id, role: "user", parts: [{ type: "text", content: text }], createdAt: 1 });
const assistantMessage = (id, text) => ({
  id,
  role: "assistant",
  parts: [{ type: "text", content: text }],
  createdAt: 2,
});

function readLines(id) {
  const raw = files.get(`${SESSION_DIR}/${id}.session.jsonl`) ?? "";
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// --- incremental append + fold + state-only re-emit + no-op -----------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "log" });
  session.uiMessages = [userMessage("u1", "hello"), assistantMessage("a1", "hi")];

  await store.save(session);
  assert.equal(readLines(session.id).length, 2, "first save writes one line per message");

  // A new message appends exactly one line.
  session.uiMessages.push(assistantMessage("a2", "more"));
  await store.save(session);
  assert.equal(readLines(session.id).length, 3, "only the new message is appended");

  // A changed message re-appends one line for that id.
  session.uiMessages[1].parts[0].content = "hi (edited)";
  await store.save(session);
  assert.equal(readLines(session.id).length, 4, "changed message appends one line");

  // State-only change re-emits the last message.
  session.todos = [{ content: "do it", status: "pending", priority: "high" }];
  await store.save(session);
  const afterStateChange = readLines(session.id);
  assert.equal(afterStateChange.length, 5, "state-only change re-emits the last message line");
  assert.deepEqual(afterStateChange[4].state.todos, session.todos, "re-emitted line carries the new state");

  // No-op save writes nothing.
  const appendsBefore = counts.appendFile;
  await store.save(session);
  assert.equal(counts.appendFile, appendsBefore, "unchanged save appends nothing");

  // Load folds the log back into the session.
  const loaded = await store.load(session.id);
  assert.deepEqual(
    loaded.uiMessages.map((m) => m.id),
    ["u1", "a1", "a2"],
    "messages folded by id in order"
  );
  assert.equal(loaded.uiMessages[1].parts[0].content, "hi (edited)", "later line wins for the same id");
  assert.deepEqual(loaded.todos, session.todos, "state folded from the newest line");
  assert.equal(loaded.name, "log");
}

// --- non-empty → empty rewrites to a single `message: null` line ------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "empty" });
  session.uiMessages = [userMessage("u1", "hi")];
  await store.save(session);
  assert.equal(readLines(session.id).length, 1);

  session.uiMessages = [];
  await store.save(session);
  const lines = readLines(session.id);
  assert.equal(lines.length, 1, "non-empty → empty rewrites to one line");
  assert.equal(lines[0].message, null, "the rewritten line carries no message");

  const loaded = await store.load(session.id);
  assert.equal(loaded.uiMessages.length, 0, "empty session folds to no messages");
}

// --- empty-session first save uses a `message: null` line -------------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "fresh" });
  await store.save(session);
  const lines = readLines(session.id);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].message, null, "first line of an empty session has no message");
  assert.equal(lines[0].state.name, "fresh");
}

// --- approvals derived from messages, approvalAt preserved ------------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "approvals" });
  session.uiMessages = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call_1",
          name: "run_command",
          arguments: "{}",
          state: "approval-responded",
          approval: { id: "approval_call_1", needsApproval: true, approved: false },
        },
      ],
      createdAt: 2,
    },
  ];
  await store.save(session);

  const lines = readLines(session.id);
  const at = lines[0].approvalAt?.["approval_call_1"];
  assert.ok(at > 0, "decided approval records its timestamp on the line");

  const loaded = await store.load(session.id);
  assert.ok(loaded.approvalTimes?.["approval_call_1"] > 0, "approvalTimes derived from the log");
}

// --- a whole-log rewrite keeps the original approval decision time ----------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "approval-rewrite" });
  const decided = (id) => ({
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_1",
        name: "run_command",
        arguments: "{}",
        state: "approval-responded",
        approval: { id: "approval_call_1", needsApproval: true, approved: true },
      },
    ],
    createdAt: 2,
  });
  session.uiMessages = [decided("a1")];
  await store.save(session);
  const decisionAt = (await store.load(session.id)).approvalTimes["approval_call_1"];
  assert.ok(decisionAt > 0, "decision time recorded on the first save");

  // A structural change (the message set is no longer an append-only extension)
  // rewrites every line with the rewrite timestamp — the explicit `approvalAt`
  // carried on the line must win over that inferred stamp.
  await new Promise((resolve) => setTimeout(resolve, 5));
  session.uiMessages = [userMessage("u0", "before"), decided("a1")];
  await store.save(session);
  assert.ok(counts.writeFile > 0, "structural change rewrites the log");
  const line = readLines(session.id).find((l) => l.message?.id === "a1");
  assert.ok(line, "the approved message survived the rewrite");
  assert.ok(line.messageUpdatedAt > decisionAt, "the rewrite stamped a later line time");
  assert.equal(line.approvalAt["approval_call_1"], decisionAt, "explicit approvalAt carries the decision time");
  assert.equal(
    (await store.load(session.id)).approvalTimes["approval_call_1"],
    decisionAt,
    "fold keeps the decision time across a rewrite (not the rewrite stamp)"
  );
}

// --- env fs without `appendFile` degrades to a full rewrite -----------------

setupEnv({ withAppend: false });
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "no-append" });
  session.uiMessages = [userMessage("u1", "hi"), assistantMessage("a1", "hello")];

  await store.save(session);
  assert.equal(counts.appendFile, 0, "appendFile is unavailable");
  assert.ok(counts.writeFile > 0, "the save degrades to a full rewrite instead of being dropped");
  assert.equal(readLines(session.id).length, 2, "every message is on disk");

  // A later save must not be deduped into nothing (the delta baseline stays truthful).
  session.uiMessages.push(assistantMessage("a2", "more"));
  await store.save(session);
  assert.equal(readLines(session.id).length, 3, "the next save is still durable");

  const loaded = await store.load(session.id);
  assert.deepEqual(
    loaded.uiMessages.map((m) => m.id),
    ["u1", "a1", "a2"],
    "fold matches after the rewrite fallback"
  );
}

// --- rewrite is atomic: temp file + rename, no leftover temp ----------------

setupEnv();
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "atomic" });
  session.uiMessages = [userMessage("u1", "hi"), assistantMessage("a1", "hello")];

  await store.save(session);
  assert.ok(counts.rename >= 1, "a rewrite renames the temp file into place");
  assert.equal(readLines(session.id).length, 2, "the rewritten log holds every message");
  assert.deepEqual(
    [...files.keys()].filter((k) => k.endsWith(".tmp")),
    [],
    "no temp file is left behind"
  );
}

// --- rename absent: rewrite falls back to an in-place write -----------------

setupEnv({ withRename: false });
{
  const store = new SessionStore();
  const session = store.create({ modelStyle: "openai", model: "m", name: "no-rename" });
  session.uiMessages = [userMessage("u1", "hi")];

  await store.save(session);
  assert.equal(counts.rename, 0, "rename is unavailable");
  assert.ok(counts.writeFile > 0, "the rewrite still writes directly");
  assert.equal(readLines(session.id).length, 1, "the log is on disk without rename");
}

// --- unprimed store converges on the session instead of appending -----------

setupEnv();
{
  const writer = new SessionStore();
  const session = writer.create({ modelStyle: "openai", model: "m", name: "unprimed" });
  session.uiMessages = [userMessage("u1", "one"), assistantMessage("a1", "two")];
  await writer.save(session);
  assert.equal(readLines(session.id).length, 2);

  // A fresh store that never called load() (so `prev` is undefined) must not
  // append into the existing log: doing so would keep the removed `a1` alive.
  const reader = new SessionStore();
  await reader.save({ ...session, uiMessages: [userMessage("u1", "one")], updatedAt: session.updatedAt });
  assert.deepEqual(
    readLines(session.id).map((l) => l.message?.id),
    ["u1"],
    "rewrite converges on the session; no stale message survives"
  );
  const loaded = await reader.load(session.id);
  assert.deepEqual(
    loaded.uiMessages.map((m) => m.id),
    ["u1"],
    "fold matches the converged log"
  );
}

console.log("session-message-log validation passed");
