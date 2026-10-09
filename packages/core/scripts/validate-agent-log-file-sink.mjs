/**
 * Validates AgentLog.attachFileSink: JSONL writes, retention of pre-attach
 * entries (bounded, drained on attach), the cap's overflow behavior,
 * size-based rotation, silent degradation when the env fs has no appendFile,
 * and detach semantics.
 *
 * Run: pnpm --filter @codent/core run validate:agent-log-file-sink
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentLog, MAX_PENDING_LOG_ENTRIES, clearCoreEnv, registerCoreEnv } from "../dist/dev.mjs";

import { waitFor } from "./helpers/log-capture.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Real-fs CoreEnv (stat returns true sizes so rotation is observable). */
function createEnv(rootPath, { withAppendFile }) {
  const fsImpl = {
    readFile: async (p, encoding) => fs.promises.readFile(p, encoding),
    writeFile: async (p, content) => fs.promises.writeFile(p, content),
    mkdir: async (p) => fs.promises.mkdir(p, { recursive: true }),
    exists: async (p) =>
      fs.promises.access(p).then(
        () => true,
        () => false
      ),
    readdir: async (p) => {
      try {
        const entries = await fs.promises.readdir(p, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      const st = await fs.promises.stat(p);
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(p, { recursive: true, force: true }),
  };
  if (withAppendFile) {
    fsImpl.appendFile = async (p, content) => fs.promises.appendFile(p, content, "utf8");
  }
  return {
    rootPath,
    getPlatform: async () => "linux",
    getArch: async () => "x64",
    getEnv: async () => ({}),
    homedir: async () => rootPath,
    fs: fsImpl,
    runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    fetch: async () => new Response(),
  };
}

const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-log-file-sink-"));
registerCoreEnv(createEnv(rootPath, { withAppendFile: true }));

const logDir = path.join(rootPath, ".agents/logs/ses_test");
const filePath = path.join(logDir, "agent.log");

// ----------------------------------------------------------------------------
// 1. Pre-attach entries are retained (bounded) and drained into the first sink,
//    in emission order, exactly once. Post-attach entries persist with data +
//    error fields.
//    Regression guard: bootstrap emits before `bindSessionLogSink` attaches, so
//    dropping pre-attach entries silently lost every extension-load failure.
// ----------------------------------------------------------------------------
const log = new AgentLog();
log.info("system", "pre-attach-kept");
log.error("agent", "boom-3", new Error("test error"));

const detach = log.attachFileSink({
  dir: logDir,
  filename: "agent.log",
  maxBytes: 400,
  maxFiles: 3,
  flushIntervalMs: 20,
});

log.info("system", "hello-1");
log.warn("agent", "warn-2", { n: 2 });
log.error("agent", "boom-3", new Error("test error"));
// Poll for the flush instead of sleeping a fixed 80ms: the interval-based flush had not run
// yet on a loaded runner, which surfaced as an ENOENT reading a file that was about to exist.
const flushedLines = await waitFor(
  async () => {
    try {
      return (await fs.promises.readFile(filePath, "utf-8")).trim().split("\n");
    } catch {
      return [];
    }
  },
  (l) => l.filter(Boolean).length >= 5
);
const lines = flushedLines.filter(Boolean);
assert.equal(lines.length, 5, `pre-attach entries retained + drained, expected 5 lines, got ${lines.length}`);

// The drain precedes anything emitted after attach, so the retained bootstrap lines
// are the first thing in the file — never interleaved or reordered behind live entries.
assert.equal(JSON.parse(lines[0]).message, "pre-attach-kept", "retained entry drained first, in emission order");
assert.equal(JSON.parse(lines[0]).category, "system");
assert.equal(JSON.parse(lines[1]).message, "boom-3", "retained entries keep emission order");
assert.equal(JSON.parse(lines[1]).error?.message, "test error", "retained entry keeps its error field");
assert.equal(JSON.parse(lines[2]).message, "hello-1", "post-attach entry follows the drained ones");

const boom = JSON.parse(lines.find((l) => l.includes("boom-3") && l.includes("error")) ?? lines[1]);
assert.ok(boom.error?.message === "test error", "error field serialized as JSONL");

const warn = JSON.parse(lines.find((l) => l.includes("warn-2")));
assert.equal(warn.data.n, 2, "data object serialized");
console.log("pre-attach retention + JSONL OK:", lines.length, "lines");

// ----------------------------------------------------------------------------
// 1b. Retention is bounded and drains exactly once.
//    - Overflow past the cap keeps the newest entries and stays finite.
//    - Re-attaching must not replay already-drained entries.
// ----------------------------------------------------------------------------
{
  const capRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-log-pending-cap-"));
  const capDir = path.join(capRoot, ".agents/logs/ses_cap");
  const capFile = path.join(capDir, "agent.log");

  const capLog = new AgentLog();
  const overflow = MAX_PENDING_LOG_ENTRIES + 25;
  for (let i = 0; i < overflow; i++) capLog.info("system", `pending-${i}`);

  const capDetach = capLog.attachFileSink({ dir: capDir, filename: "agent.log", flushIntervalMs: 10 });
  const capLines = (
    await waitFor(
      async () => {
        try {
          return (await fs.promises.readFile(capFile, "utf-8")).trim().split("\n");
        } catch {
          return [];
        }
      },
      (l) => l.filter(Boolean).length >= MAX_PENDING_LOG_ENTRIES
    )
  ).filter(Boolean);

  assert.equal(
    capLines.length,
    MAX_PENDING_LOG_ENTRIES,
    `cap must bound retention to ${MAX_PENDING_LOG_ENTRIES}, got ${capLines.length}`
  );
  const first = JSON.parse(capLines[0]).message;
  const last = JSON.parse(capLines[capLines.length - 1]).message;
  assert.equal(last, `pending-${overflow - 1}`, "newest entry is retained (oldest dropped at the cap)");
  assert.equal(first, `pending-${overflow - MAX_PENDING_LOG_ENTRIES}`, "the oldest entries are the ones dropped");

  // Drain is one-shot: a second sink must not replay the first sink's entries.
  capDetach();
  const secondDetach = capLog.attachFileSink({ dir: capDir, filename: "agent.log", flushIntervalMs: 10 });
  capLog.info("system", "after-reattach");
  await sleep(40);
  const afterReattach = (await fs.promises.readFile(capFile, "utf-8")).split("\n").filter(Boolean);
  const replayed = afterReattach.filter((l) => l.includes('pending-0"') || l.includes('pending-1"')).length;
  assert.equal(replayed, 0, "drained entries are not replayed by a later attach");
  assert.equal(afterReattach.filter((l) => l.includes("after-reattach")).length, 1, "post-reattach entry written once");
  secondDetach();
  console.log("pending-buffer cap + one-shot drain OK:", capLines.length, "retained of", overflow);
}

// ----------------------------------------------------------------------------
// 2. Rotation: small batches push the file past maxBytes → segment files.
// ----------------------------------------------------------------------------
for (let batch = 0; batch < 6; batch++) {
  for (let i = 0; i < 3; i++) {
    log.info("system", `padding-${batch}-${i}-` + "x".repeat(60));
  }
  await sleep(40);
}

const entries = (await fs.promises.readdir(logDir)).sort();
assert.ok(entries.includes("agent.log"), `active file present, got ${entries}`);
const rotated = entries.filter((e) => /^agent\.log\.\d+$/.test(e));
assert.ok(rotated.length >= 1, `expected >=1 rotated segment, got ${entries.join(", ")}`);
console.log("rotation OK:", entries.join(", "));

// ----------------------------------------------------------------------------
// 3. Silent degradation: fs without appendFile must not write nor throw.
// ----------------------------------------------------------------------------
{
  const noAppendRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-log-no-append-"));
  clearCoreEnv();
  registerCoreEnv(createEnv(noAppendRoot, { withAppendFile: false }));

  const noAppendLog = new AgentLog();
  const noAppendDetach = noAppendLog.attachFileSink({
    dir: path.join(noAppendRoot, ".agents/logs/ses_quiet"),
  });
  noAppendLog.info("system", "should-not-crash");
  await sleep(30);
  noAppendDetach();

  assert.equal(noAppendLog.getFileSinkDir(), null, "no sink dir recorded when degraded");
  const written = await fs.promises.readdir(noAppendRoot);
  assert.deepEqual(written, [], "no files written without appendFile");
  console.log("silent degradation OK (no appendFile → no write, no throw)");

  // Restore the real-fs env for the detach test below.
  clearCoreEnv();
  registerCoreEnv(createEnv(rootPath, { withAppendFile: true }));
}

// ----------------------------------------------------------------------------
// 4. Detach stops writes.
// ----------------------------------------------------------------------------
detach();
await sleep(40);
const afterDetach = await fs.promises.readFile(filePath, "utf-8");
log.info("system", "post-detach");
await sleep(40);
assert.equal(await fs.promises.readFile(filePath, "utf-8"), afterDetach, "no writes after detach");
console.log("detach OK");

// ----------------------------------------------------------------------------
// 5. Reused log file: re-attaching to an existing file writes a session
//    divider so a new launch does not blend into the previous one.
// ----------------------------------------------------------------------------
const log2 = new AgentLog();
const detach2 = log2.attachFileSink({
  dir: logDir,
  filename: "agent.log",
  flushIntervalMs: 20,
});
log2.info("system", "launch-2");
await sleep(60);

const content2 = await fs.promises.readFile(filePath, "utf-8");
const markerMatch = content2.match(/---------- [^\n]+ new session ----------/);
assert.ok(markerMatch, `reused file must contain a session divider, got:\n${content2.slice(0, 300)}`);
const beforeMarker = content2.slice(0, markerMatch.index).trim();
assert.ok(beforeMarker.length > 0, "previous launch entries precede the divider");
const afterMarker = content2.slice(markerMatch.index + markerMatch[0].length);
assert.ok(afterMarker.includes("launch-2"), "new launch entries follow the divider");
detach2();
console.log("reused-file divider OK");

await fs.promises.rm(rootPath, { recursive: true, force: true });
console.log("agent-log-file-sink validation passed");
