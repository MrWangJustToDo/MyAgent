/**
 * Validates the task pre-fork coordinator (rolling-window parallel spawning).
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

// --- rolling window: over-cap runs queue and start as slots free ---

{
  const coordinator = new TaskPreforkCoordinator();
  const TOTAL = MAX_ACTIVE_TASK_PREFORKS + 3;
  const startedOrder = [];
  const finished = [];
  for (let i = 0; i < TOTAL; i++) {
    coordinator.start(
      `call-${i}`,
      () => {},
      async () => {
        startedOrder.push(i);
        await sleep(15);
        finished.push(i);
        return { subagentId: `s${i}` };
      }
    );
  }
  assert.equal(coordinator.size, TOTAL, "all runs are registered");
  assert.ok(
    coordinator.activeCount <= MAX_ACTIVE_TASK_PREFORKS,
    `concurrency must be capped (${coordinator.activeCount})`
  );

  // Let the first wave finish; queued runs must roll forward automatically.
  const results = await Promise.all(Array.from({ length: TOTAL }, (_, i) => coordinator.join(`call-${i}`)));
  assert.equal(finished.length, TOTAL, "every run completed");
  assert.deepEqual(startedOrder, [...Array(TOTAL).keys()], "runs start in FIFO order as slots free");
  assert.ok(results.every((r) => r && r.subagentId));
}

// --- onRunStart fires on slot acquisition, not registration ---

{
  const coordinator = new TaskPreforkCoordinator();
  const starts = [];
  for (let i = 0; i < MAX_ACTIVE_TASK_PREFORKS + 2; i++) {
    coordinator.start(
      `q-${i}`,
      () => {},
      async () => {
        await sleep(20);
        return {};
      },
      () => starts.push(i)
    );
  }
  await sleep(5);
  assert.equal(starts.length, MAX_ACTIVE_TASK_PREFORKS, "only admitted runs fire onRunStart");
  await Promise.all(Array.from({ length: MAX_ACTIVE_TASK_PREFORKS + 2 }, (_, i) => coordinator.join(`q-${i}`)));
  assert.equal(starts.length, MAX_ACTIVE_TASK_PREFORKS + 2, "queued runs fire onRunStart once admitted");
}

// --- abortAll cancels running runs and drops bookkeeping ---

{
  const coordinator = new TaskPreforkCoordinator();
  const aborts = [];
  coordinator.start(
    "a",
    () => aborts.push("a"),
    () => new Promise(() => {})
  );
  coordinator.start(
    "b",
    () => aborts.push("b"),
    () => new Promise(() => {})
  );
  for (let i = 0; i < MAX_ACTIVE_TASK_PREFORKS; i++) {
    coordinator.start(
      `q${i}`,
      () => aborts.push(`q${i}`),
      () => new Promise(() => {})
    );
  }

  coordinator.abortAll();
  assert.equal(coordinator.size, 0, "entries are dropped after abortAll");
  assert.equal(aborts.length, MAX_ACTIVE_TASK_PREFORKS + 2, "every run's cancel handle fired");
}

// --- queued run aborted before admission never runs ---

{
  const coordinator = new TaskPreforkCoordinator();
  // Fill all slots with never-resolving runs.
  for (let i = 0; i < MAX_ACTIVE_TASK_PREFORKS; i++) {
    coordinator.start(
      `blocker-${i}`,
      () => {},
      () => new Promise(() => {})
    );
  }
  let factoryRan = false;
  let runStarted = false;
  coordinator.start(
    "queued",
    () => {},
    async () => {
      factoryRan = true;
      return {};
    },
    () => {
      runStarted = true;
    }
  );
  assert.equal(runStarted, false, "queued run has not acquired a slot");

  coordinator.abortAll();
  await sleep(10);
  assert.equal(factoryRan, false, "cancelled-while-queued run must never execute");
  assert.equal(runStarted, false, "cancelled-while-queued run must never fire onRunStart");
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
