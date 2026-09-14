/**
 * Validates CommandJobRegistry poll/kill/destroyAll semantics plus the durable
 * per-job log: creation, arrival order, stderr marking, terminal footer, size
 * cap, eviction/teardown deletion, stale sweep and degraded hosts.
 *
 * Run: pnpm --filter @my-agent/core run validate:command-job-registry
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  COMMAND_JOB_LOG_DIR,
  MAX_JOB_LOG_BYTES,
  MAX_JOB_LOG_AGE_MS,
  clearCoreEnv,
  commandJobRegistry,
  registerCoreEnv,
  sweepStaleJobLogs,
} from "../dist/dev.mjs";

const registry = commandJobRegistry;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Mock CoreEnv backed by the real filesystem (relative paths resolve against
// rootPath, like the Node adapter).
// ---------------------------------------------------------------------------
function createEnv(rootPath, { withAppendFile = true } = {}) {
  const resolve = (p) => (path.isAbsolute(p) ? p : path.join(rootPath, p));
  const fsImpl = {
    readFile: async (p, encoding) => fs.promises.readFile(resolve(p), encoding ?? "utf-8"),
    writeFile: async (p, content) => fs.promises.writeFile(resolve(p), content),
    mkdir: async (p) => fs.promises.mkdir(resolve(p), { recursive: true }),
    exists: async (p) =>
      fs.promises.access(resolve(p)).then(
        () => true,
        () => false
      ),
    readdir: async (p) => {
      try {
        const entries = await fs.promises.readdir(resolve(p), { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      const st = await fs.promises.stat(resolve(p));
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(resolve(p), { recursive: true, force: true }),
  };
  if (withAppendFile === "throwing") {
    fsImpl.appendFile = async () => {
      throw new Error("appendFile failed");
    };
  } else if (withAppendFile) {
    fsImpl.appendFile = async (p, content) => fs.promises.appendFile(resolve(p), content, "utf8");
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

const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "command-job-registry-"));
registerCoreEnv(createEnv(rootPath));

const abs = (relPath) => path.join(rootPath, relPath);
const logExists = async (relPath) =>
  fs.promises.access(abs(relPath)).then(
    () => true,
    () => false
  );
/** Wait until the log contains `needle` (writer flushes on a timer). */
async function waitForLog(relPath, needle, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const content = await fs.promises.readFile(abs(relPath), "utf-8").catch(() => "");
    if (content.includes(needle) || Date.now() > deadline) return content;
    await sleep(25);
  }
}

// ---------------------------------------------------------------------------
// 1. Create a job
// ---------------------------------------------------------------------------
const job = registry.create("echo hello");
assert.equal(job.status, "running");
assert.ok(job.id.startsWith("job_"));
assert.equal(job.stdout, "");
assert.equal(job.stderr, "");
assert.equal(job.exitCode, null);
assert.ok(job.startedAt > 0);
assert.equal(job.endedAt, null);
assert.equal(job.logPath, `${COMMAND_JOB_LOG_DIR}/${job.id}.log`);

// ---------------------------------------------------------------------------
// 2. Append output and poll incrementally
// ---------------------------------------------------------------------------
registry.appendStdout(job.id, "hello\n");
registry.appendStderr(job.id, "warn: test\n");

let result = registry.poll(job.id);
assert.equal(result.jobId, job.id);
assert.equal(result.status, "running");
assert.equal(result.stdout, "hello\n");
assert.equal(result.stderr, "warn: test\n");
assert.equal(result.exitCode, null);
assert.equal(result.running, true);
assert.equal(result.logPath, job.logPath);

// Second poll returns empty (cursor advanced)
result = registry.poll(job.id);
assert.equal(result.stdout, "");
assert.equal(result.stderr, "");

// ---------------------------------------------------------------------------
// 3. Append after poll — only new data returned
// ---------------------------------------------------------------------------
registry.appendStdout(job.id, "world\n");
result = registry.poll(job.id);
assert.equal(result.stdout, "world\n");
assert.equal(result.stderr, "");

// ---------------------------------------------------------------------------
// 4. markExited transitions status
// ---------------------------------------------------------------------------
registry.markExited(job.id, 0);
assert.equal(job.status, "exited");
assert.equal(job.exitCode, 0);
assert.ok(job.endedAt !== null);

result = registry.poll(job.id);
assert.equal(result.status, "exited");
assert.equal(result.running, false);

// ---------------------------------------------------------------------------
// 5. Log content: header, arrival order, stderr marking, terminal footer
// ---------------------------------------------------------------------------
{
  const content = await waitForLog(job.logPath, "[exit 0");
  assert.ok(
    content.startsWith("# echo hello\n"),
    `header starts the log, got: ${JSON.stringify(content.slice(0, 40))}`
  );
  assert.ok(/^# started \d{4}-/m.test(content), "header records the start time");

  const stdoutAt = content.indexOf("hello\n");
  const stderrAt = content.indexOf("[stderr] warn: test\n");
  const secondAt = content.indexOf("world\n");
  const footerAt = content.indexOf("[exit 0 · exited · finished ");
  assert.ok(stdoutAt > 0, "stdout written");
  assert.ok(stderrAt > stdoutAt, "stderr marked and ordered after the preceding stdout chunk");
  assert.ok(secondAt > stderrAt, "later stdout follows in arrival order");
  assert.ok(footerAt > secondAt, "terminal footer closes the log");
  console.log("job log content OK");
}

// ---------------------------------------------------------------------------
// 6. Running jobs can be killed (and the log records the terminal status)
// ---------------------------------------------------------------------------
let killCalled = false;
const killable = registry.create("sleep 10");
registry.appendStdout(killable.id, "listening on :5173\n");
registry.setKill(killable.id, async () => {
  killCalled = true;
});
const killed = await registry.kill(killable.id);
assert.equal(killed, true);
assert.equal(killCalled, true);
assert.equal(killable.status, "killed");

{
  const content = await waitForLog(killable.logPath, "· killed ·");
  assert.ok(content.includes("[exit n/a · killed · finished "), "killed job log carries a footer");
  assert.ok(content.includes("listening on :5173"), "killed job log keeps its output");
  console.log("kill footer OK");
}

// ---------------------------------------------------------------------------
// 7. Unknown job returns null from get/poll
// ---------------------------------------------------------------------------
assert.equal(registry.get("nonexistent"), undefined);
assert.equal(registry.poll("nonexistent"), null);

// ---------------------------------------------------------------------------
// 8. Append after non-running is no-op (memory and log)
// ---------------------------------------------------------------------------
registry.appendStdout(job.id, "after exit\n");
result = registry.poll(job.id);
assert.equal(result.stdout, ""); // no data — we stopped appending when exited
assert.equal((await waitForLog(job.logPath, "[exit 0")).includes("after exit"), false);

// ---------------------------------------------------------------------------
// 9. destroyAll kills all, clears, and deletes the logs
// ---------------------------------------------------------------------------
const jobA = registry.create("echo a");
const jobB = registry.create("echo b");
registry.appendStdout(jobA.id, "a\n");
registry.appendStdout(jobB.id, "b\n");
assert.ok(registry.get(jobA.id) !== undefined);
assert.ok(registry.get(jobB.id) !== undefined);
// Let both writers create their files before teardown.
await waitForLog(jobA.logPath, "# echo a");
await waitForLog(jobB.logPath, "# echo b");
await registry.destroyAll();
assert.equal(registry.get(jobA.id), undefined);
assert.equal(registry.get(jobB.id), undefined);
assert.equal(await logExists(jobA.logPath), false, "teardown deletes the job log");
assert.equal(await logExists(jobB.logPath), false, "teardown deletes the job log");
console.log("teardown log deletion OK");

// ---------------------------------------------------------------------------
// 10. Size cap: the head is durable, one marker, no further appends
// ---------------------------------------------------------------------------
{
  const capJob = registry.create("echo cap");
  const chunkFor = (i) => `${String(i).padStart(2, "0")}-` + "x".repeat(MIB - 4) + "\n";
  for (let i = 0; i < 17; i++) registry.appendStdout(capJob.id, chunkFor(i));
  registry.markExited(capJob.id, 0);

  const content = await waitForLog(capJob.logPath, "log truncated at");
  const stat = await fs.promises.stat(abs(capJob.logPath));
  assert.equal((content.match(/log truncated at/g) ?? []).length, 1, "exactly one truncation marker");
  assert.ok(content.startsWith("# echo cap\n"), "head survives the cap");
  assert.ok(content.includes("14-"), "output below the cap is retained");
  assert.equal(content.includes("16-"), false, "output past the cap is not appended");
  assert.ok(stat.size < MAX_JOB_LOG_BYTES, `log stays under the cap (${stat.size} bytes)`);
  assert.ok(content.includes("[exit 0 · exited · finished "), "footer written even after truncation");
  console.log("size cap OK:", stat.size, "bytes");
}

// ---------------------------------------------------------------------------
// 11. Registry eviction deletes the evicted job's log
// ---------------------------------------------------------------------------
{
  const created = [];
  for (let i = 0; i < 51; i++) {
    const j = registry.create(`evict-${i}`);
    registry.appendStdout(j.id, `out-${i}\n`);
    if (i === 0) await waitForLog(j.logPath, "out-0"); // ensure the file exists before eviction
    registry.markExited(j.id, 0);
    registry.collectCompleted(); // notified finished jobs are the evictable ones
    created.push(j);
  }
  await sleep(400); // let the eviction removal settle
  assert.equal(await logExists(created[0].logPath), false, "evicted job log deleted");
  assert.equal(await logExists(created[50].logPath), true, "retained job log kept");
  console.log("eviction log deletion OK");
}

// ---------------------------------------------------------------------------
// 12. Degraded host: fs without appendFile → null path, no writes, no throw
// ---------------------------------------------------------------------------
{
  const noAppendRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "command-job-no-append-"));
  clearCoreEnv();
  registerCoreEnv(createEnv(noAppendRoot, { withAppendFile: false }));

  const quiet = registry.create("echo quiet");
  assert.equal(quiet.logPath, null, "no log path without appendFile");
  registry.appendStdout(quiet.id, "ignored\n");
  registry.appendStderr(quiet.id, "ignored\n");
  registry.markExited(quiet.id, 0);
  const quietPoll = registry.poll(quiet.id);
  assert.equal(quietPoll.logPath, null);
  assert.equal(quietPoll.status, "exited");
  assert.deepEqual(await fs.promises.readdir(noAppendRoot), [], "nothing written without appendFile");
  console.log("degraded host OK (no appendFile → null path, no write, no throw)");

  clearCoreEnv();
  registerCoreEnv(createEnv(rootPath));
}

// ---------------------------------------------------------------------------
// 13. Runtime write failure: logging degrades and the path stops being advertised
// ---------------------------------------------------------------------------
{
  const throwRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "command-job-throwing-"));
  clearCoreEnv();
  registerCoreEnv(createEnv(throwRoot, { withAppendFile: "throwing" }));

  const failing = registry.create("echo failing");
  assert.equal(failing.logPath, `${COMMAND_JOB_LOG_DIR}/${failing.id}.log`, "path advertised while healthy");
  registry.appendStdout(failing.id, "boom\n");
  await sleep(400); // let the failing flush settle
  assert.equal(registry.get(failing.id)?.logPath, null, "path cleared after a write failure");
  assert.equal(registry.poll(failing.id).logPath, null, "poll stops advertising the path");
  assert.doesNotThrow(() => registry.appendStderr(failing.id, "more\n"));
  assert.doesNotThrow(() => registry.markExited(failing.id, 1));
  assert.equal(registry.poll(failing.id).status, "exited", "job stays queryable after a logging failure");
  console.log("runtime log failure OK (path cleared, command unaffected)");

  clearCoreEnv();
  registerCoreEnv(createEnv(rootPath));
}

// ---------------------------------------------------------------------------
// 14. Stale sweep: only logs past the age threshold are removed
// ---------------------------------------------------------------------------
{
  const staleRel = `${COMMAND_JOB_LOG_DIR}/job_stale.log`;
  const freshRel = `${COMMAND_JOB_LOG_DIR}/job_fresh.log`;
  await fs.promises.mkdir(abs(COMMAND_JOB_LOG_DIR), { recursive: true });
  await fs.promises.writeFile(abs(staleRel), "# stale\n");
  await fs.promises.writeFile(abs(freshRel), "# fresh\n");
  const old = new Date(Date.now() - MAX_JOB_LOG_AGE_MS - 60_000);
  await fs.promises.utimes(abs(staleRel), old, old);

  const swept = await sweepStaleJobLogs({ force: true });
  assert.equal(swept, 1, `expected exactly the stale log to be swept, got ${swept}`);
  assert.equal(await logExists(staleRel), false, "stale log removed");
  assert.equal(await logExists(freshRel), true, "fresh log kept");
  console.log("stale sweep OK");
}

await registry.destroyAll();

console.log("command-job-registry validation passed");
