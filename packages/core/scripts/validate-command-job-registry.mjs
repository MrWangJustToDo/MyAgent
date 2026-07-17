/**
 * Validates CommandJobRegistry poll/kill/destroyAll semantics.
 *
 * Run: pnpm --filter @my-agent/core run validate:command-job-registry
 */

import assert from "node:assert/strict";

import { commandJobRegistry } from "../dist/dev.mjs";

const registry = commandJobRegistry;

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
// 5. Running jobs can be killed
// ---------------------------------------------------------------------------
let killCalled = false;
const killable = registry.create("sleep 10");
registry.setKill(killable.id, async () => { killCalled = true; });
const killed = await registry.kill(killable.id);
assert.equal(killed, true);
assert.equal(killCalled, true);
assert.equal(killable.status, "killed");

// ---------------------------------------------------------------------------
// 6. Unknown job returns null from get/poll
// ---------------------------------------------------------------------------
assert.equal(registry.get("nonexistent"), undefined);
assert.equal(registry.poll("nonexistent"), null);

// ---------------------------------------------------------------------------
// 7. Append after non-running is no-op
// ---------------------------------------------------------------------------
registry.appendStdout(job.id, "after exit\n");
result = registry.poll(job.id);
assert.equal(result.stdout, "");  // no data — we stopped appending when exited

// ---------------------------------------------------------------------------
// 8. destroyAll kills all and clears
// ---------------------------------------------------------------------------
const jobA = registry.create("echo a");
const jobB = registry.create("echo b");
assert.ok(registry.get(jobA.id) !== undefined);
assert.ok(registry.get(jobB.id) !== undefined);
await registry.destroyAll();
assert.equal(registry.get(jobA.id), undefined);
assert.equal(registry.get(jobB.id), undefined);

console.log("command-job-registry validation passed");
