/**
 * Validates the task pre-fork coordinator (parallel subagent spawning).
 *
 * Run: pnpm --filter @my-agent/core run validate:task-prefork
 */

import assert from "node:assert/strict";

import { MAX_ACTIVE_TASK_PREFORKS, TaskPreforkCoordinator } from "../dist/dev.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- start / join semantics ---

{
  const coordinator = new TaskPreforkCoordinator();
  let started = 0;
  const ok = coordinator.start(
    "call-1",
    () => {},
    async () => {
      started += 1;
      await sleep(20);
      return { subagentId: "sub-1", output: "done" };
    }
  );
  assert.equal(ok, true);
  assert.equal(coordinator.has("call-1"), true);

  // Double-start for same id is idempotent.
  assert.equal(
    coordinator.start(
      "call-1",
      () => {},
      async () => ({})
    ),
    true
  );
  assert.equal(coordinator.size, 1);

  const result = await coordinator.join("call-1");
  assert.equal(result.output, "done");
  assert.equal(started, 1);
  assert.equal(coordinator.has("call-1"), false, "join releases the slot");
}

// --- join unknown id returns null ---

{
  const coordinator = new TaskPreforkCoordinator();
  assert.equal(await coordinator.join("missing"), null);
}

// --- concurrency cap ---

{
  const coordinator = new TaskPreforkCoordinator();
  const aborts = [];
  for (let i = 0; i < MAX_ACTIVE_TASK_PREFORKS; i++) {
    const ok = coordinator.start(
      `call-${i}`,
      () => aborts.push(i),
      async () => ({})
    );
    assert.equal(ok, true);
  }
  const overflowAborts = [];
  assert.equal(
    coordinator.start(
      "overflow",
      () => overflowAborts.push("x"),
      async () => ({})
    ),
    false,
    "cap must reject additional pre-forks"
  );
  assert.equal(overflowAborts.length, 0, "rejected spawn must not arm its abort handle");

  coordinator.abortAll();
  assert.equal(aborts.length > 0 || MAX_ACTIVE_TASK_PREFORKS === 0, true);
}

// --- abortAll clears entries and invokes handles ---

{
  const coordinator = new TaskPreforkCoordinator();
  let aborted = 0;
  coordinator.start(
    "a",
    () => aborted++,
    async () => new Promise(() => {})
  );
  coordinator.start(
    "b",
    () => aborted++,
    async () => new Promise(() => {})
  );
  coordinator.abortAll();
  assert.equal(aborted, 2);
  assert.equal(coordinator.size, 0);
}

// --- parallel timing: two runs overlap ---

{
  const coordinator = new TaskPreforkCoordinator();
  const marks = [];
  coordinator.start(
    "p1",
    () => {},
    async () => {
      marks.push(["p1", Date.now()]);
      await sleep(60);
      return {};
    }
  );
  await sleep(5);
  coordinator.start(
    "p2",
    () => {},
    async () => {
      marks.push(["p2", Date.now()]);
      await sleep(60);
      return {};
    }
  );

  const [r1, r2] = await Promise.all([coordinator.join("p1"), coordinator.join("p2")]);
  assert.ok(r1 && r2);
  const gap = Math.abs(marks[1][1] - marks[0][1]);
  assert.ok(gap < 50, `runs must overlap (gap=${gap}ms)`);
}

// --- middleware module is loadable and named ---

{
  const { createTaskPreforkMiddleware } = await import("../dist/dev.mjs");
  const middleware = createTaskPreforkMiddleware({
    getManagedAgent: () => undefined,
    manager: {},
  });
  assert.equal(middleware.name, "task-prefork");
  // Chunks pass through untouched when no agent is bound.
  const chunk = { type: "TOOL_CALL_END", toolCallId: "t1" };
  assert.deepEqual(await middleware.onChunk({}, chunk), chunk);
}

console.log("task-prefork validation passed");
