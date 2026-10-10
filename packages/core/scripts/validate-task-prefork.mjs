/**
 * Validates the task pre-fork coordinator (rolling-window parallel spawning).
 *
 * Run: pnpm --filter @codent/core run validate:task-prefork
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

// --- abortAll(cause) reports what it discarded, with the spawned subagents ---
//
// This is the record the middleware turns into `subagent:prefork-discarded`, and the only
// thing that names an orphan: a pre-fork thrown away AFTER it spawned its subagent leaves
// that subagent aborted-with-no-join, while the tool phase spawns a second one for the same
// call id. Without the record the two are indistinguishable in the log.

{
  const coordinator = new TaskPreforkCoordinator();
  coordinator.start(
    "discarded",
    () => {},
    () => new Promise(() => {})
  );
  coordinator.recordSpawn("discarded", "subagent-orphan");
  coordinator.start(
    "finished",
    () => {},
    async () => ({ subagentId: "subagent-real", output: "done" })
  );
  coordinator.recordSpawn("finished", "subagent-real");

  // A call that completed normally is joined away — it must never be reported.
  const joined = await coordinator.join("finished");
  assert.ok(joined, "the joined call returns its result");

  const discarded = coordinator.abortAll("run-finish");
  assert.equal(discarded.length, 1, "only the still-registered call is reported");
  assert.equal(discarded[0].toolCallId, "discarded");
  assert.equal(discarded[0].cause, "run-finish", "the cause is carried through");
  assert.deepEqual(
    discarded[0].subagentIds,
    ["subagent-orphan"],
    "the record names the subagent that was already spawned — the orphan"
  );

  // Without a cause the coordinator stays silent: the plain reset (no reporting path)
  // must not manufacture records for callers that do not consume them.
  const coordinator2 = new TaskPreforkCoordinator();
  coordinator2.start(
    "quiet",
    () => {},
    () => new Promise(() => {})
  );
  assert.deepEqual(coordinator2.abortAll(), [], "a causeless abortAll reports nothing");

  // An entry already aborted is not reported twice (idempotence of a double reset).
  const again = coordinator.abortAll("run-abort");
  assert.deepEqual(again, [], "a reset after a reset discards nothing");
}

// --- recordSpawn is a no-op for an unregistered call ---

{
  const coordinator = new TaskPreforkCoordinator();
  // The serial fallback path runs the subagent without registering a pre-fork; recording
  // must not create an entry (the tool call would then be reported as discarded on the
  // next reset even though nothing was ever thrown away).
  coordinator.recordSpawn("never-registered", "subagent-x");
  assert.equal(coordinator.has("never-registered"), false, "recordSpawn does not register an entry");
  assert.deepEqual(coordinator.abortAll("new-attempt"), [], "and nothing is reported for it");
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
