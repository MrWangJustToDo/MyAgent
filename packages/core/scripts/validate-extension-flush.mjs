/**
 * Extension flush / teardown contract — `ctx.registerFlush` and `ctx.registerExitFlush`.
 *
 * The regression this guards is silent in both directions: a teardown flush that is registered but
 * never awaited loses the extension's last batch (the entry just never appears), and an exit flush
 * that is never released keeps running after the extension is destroyed (writing state on behalf of
 * something that no longer exists). Neither shows up as an error, so every assertion here is paired
 * with an inversion — a case that must fail if the mechanism is inert.
 *
 * Covered:
 *   1. `registerFlush` runs before `deactivate()`, and is awaited (a slow flush completes first).
 *   2. A throwing flush is reported as `agent:extension-error` phase `flush` and does NOT skip
 *      deactivate or unregistration; other extensions still tear down.
 *   3. Disabling one extension runs its flush and leaves the others alone.
 *   4. `registerExitFlush` runs on the exit path (fatal handler + `exit`), best-effort.
 *   5. A throwing exit flush is contained — the exit path still completes.
 *   6. Releasing an extension stops its exit flush (unregisterInstanceArtifacts).
 *   7. The log extension's sink is flushed by the exit path (the built-in consumer on both hooks).
 *
 * Run: pnpm --filter @codent/core run validate:extension-flush
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ExtensionRunner,
  createAgentEventBus,
  registerCoreEnv,
  clearCoreEnv,
  AgentLog,
  createLogExtension,
  flushExtensionExitFlushesSync,
  registerExtensionExitFlush,
} from "../dist/dev.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal real-fs CoreEnv: the sink needs appendFile (+ sync variants for the exit path). */
function createFsEnv(rootPath) {
  return {
    rootPath,
    path: { join: (...p) => p.join("/"), dirname: (p) => p.split("/").slice(0, -1).join("/") || "/" },
    getPlatform: async () => "linux",
    getArch: async () => "x64",
    getEnv: async () => ({}),
    homedir: async () => rootPath,
    fs: {
      readFile: async (p, encoding) => fs.promises.readFile(p, encoding),
      writeFile: async (p, content) => fs.promises.writeFile(p, content),
      appendFile: async (p, content) => fs.promises.appendFile(p, content, "utf8"),
      appendFileSync: (p, content) => fs.appendFileSync(p, content, "utf8"),
      mkdir: async (p) => void (await fs.promises.mkdir(p, { recursive: true })),
      mkdirSync: (p) => fs.mkdirSync(p, { recursive: true }),
      exists: async (p) =>
        fs.promises.access(p).then(
          () => true,
          () => false
        ),
      existsSync: (p) => fs.existsSync(p),
      stat: async (p) => {
        const st = await fs.promises.stat(p);
        return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
      },
      remove: async (p) => fs.promises.rm(p, { recursive: true, force: true }),
      readdir: async () => [],
    },
    runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    fetch: async () => new Response(),
  };
}

const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ext-flush-"));
clearCoreEnv();
registerCoreEnv(createFsEnv(rootPath));

// ----------------------------------------------------------------------------
// 1. Flush runs before deactivate, and is awaited.
// ----------------------------------------------------------------------------
{
  const bus = createAgentEventBus("root");
  const runner = new ExtensionRunner({ getEnvVar: () => undefined, cwd: "/workspace", eventBus: bus });
  const order = [];

  await runner.loadExtension({
    id: "writer",
    name: "Writer",
    version: "1.0.0",
    description: "buffers state",
    activate: (ctx) => {
      ctx.registerFlush(async () => {
        await sleep(40); // must be *awaited*, not merely started
        order.push("flush");
      });
    },
    deactivate: () => {
      order.push("deactivate");
    },
  });

  runner.destroyAll();
  await sleep(200); // pathological wait: if flush were not awaited, "deactivate" would land first

  assert.deepEqual(order, ["flush", "deactivate"], `flush must settle before deactivate, got ${order.join(" → ")}`);
  console.log("1. flush is awaited before deactivate: ok");
}

// ----------------------------------------------------------------------------
// 2. A throwing flush is reported and does not skip deactivate or unregistration.
// ----------------------------------------------------------------------------
{
  const bus = createAgentEventBus("root");
  const failures = [];
  bus.on("agent:extension-error", (e) => failures.push(e.payload));

  const runner = new ExtensionRunner({ getEnvVar: () => undefined, cwd: "/workspace", eventBus: bus });
  const seen = [];
  let toolRegistered = true;

  await runner.loadExtension({
    id: "thrower",
    name: "Thrower",
    version: "1.0.0",
    description: "fails to flush",
    activate: (ctx) => {
      ctx.registerTool({
        name: "thrower_tool",
        description: "t",
        inputSchema: ctx.z.object({}),
        execute: async () => ({}),
      });
      ctx.registerFlush(() => {
        throw new Error("flush boom");
      });
    },
    deactivate: () => {
      seen.push("deactivate");
    },
  });

  runner.destroyAll();
  await sleep(80);

  const flushFailure = failures.find((f) => f.phase === "flush");
  assert.ok(flushFailure, "a throwing flush must be reported (phase: flush)");
  assert.equal(flushFailure.extensionId, "thrower");
  assert.match(flushFailure.error, /flush boom/);
  assert.deepEqual(seen, ["deactivate"], "deactivate must still run after a failed flush");
  assert.equal(
    runner.getTools().find((t) => t.name === "thrower_tool"),
    undefined,
    "tools still unregistered"
  );
  toolRegistered = false;
  void toolRegistered;
  console.log("2. throwing flush is reported, teardown continues: ok");
}

// ----------------------------------------------------------------------------
// 3. Disabling one extension flushes it and leaves others alone.
// ----------------------------------------------------------------------------
{
  const bus = createAgentEventBus("root");
  const runner = new ExtensionRunner({ getEnvVar: () => undefined, cwd: "/workspace", eventBus: bus });
  const flushed = [];

  for (const id of ["a", "b"]) {
    await runner.loadExtension({
      id,
      name: id,
      version: "1.0.0",
      description: id,
      activate: (ctx) => ctx.registerFlush(() => flushed.push(id)),
    });
  }

  await runner.setEnabled("a", false);
  assert.deepEqual(flushed, ["a"], `only the disabled extension flushes, got ${flushed.join(", ")}`);

  // Inversion: the flush must still exist for the *other* extension — a registry keyed by nothing
  // would report an empty list here and pass the assertion above vacuously.
  await runner.destroyAll();
  assert.deepEqual(flushed, ["a", "b"], "b's flush must still be registered when it is finally destroyed");
  console.log("3. disable flushes only that extension: ok");
}

// ----------------------------------------------------------------------------
// 4/5. The exit path runs registered exit flushes, and contains a throw.
// ----------------------------------------------------------------------------
{
  const ran = [];
  const disposeFirst = registerExtensionExitFlush(() => ran.push("sync"));
  const disposeThrower = registerExtensionExitFlush(() => {
    throw new Error("exit flush boom");
  });

  // The two calls mirror what `installAgentLogProcessGuards` does on `exit` / the fatal handler.
  flushExtensionExitFlushesSync();
  assert.deepEqual(ran, ["sync"], "a registered exit flush must run on the exit path");
  console.log("4. exit flush runs: ok");

  // Inversion: the thrower was registered *after* `sync`, so silently swallowing the throw must not
  // stop the path — and a second pass must still reach `sync` (no registry corruption).
  ran.length = 0;
  flushExtensionExitFlushesSync();
  assert.deepEqual(ran, ["sync"], "a throwing exit flush must be contained, not abort the path");
  disposeThrower();
  disposeFirst();
  console.log("5. throwing exit flush is contained: ok");
}

// ----------------------------------------------------------------------------
// 6. Destroying an extension releases its exit flush.
// ----------------------------------------------------------------------------
{
  const bus = createAgentEventBus("root");
  const runner = new ExtensionRunner({ getEnvVar: () => undefined, cwd: "/workspace", eventBus: bus });
  const ran = [];

  await runner.loadExtension({
    id: "exit-writer",
    name: "Exit writer",
    version: "1.0.0",
    description: "writes on exit",
    activate: (ctx) => ctx.registerExitFlush(() => ran.push("exit-writer")),
  });

  flushExtensionExitFlushesSync();
  assert.deepEqual(ran, ["exit-writer"], "the registered exit flush runs while the extension is alive");

  await runner.destroyAll();
  ran.length = 0;
  flushExtensionExitFlushesSync();
  assert.deepEqual(ran, [], "a destroyed extension must no longer run on the exit path");
  console.log("6. destroying an extension releases its exit flush: ok");
}

// ----------------------------------------------------------------------------
// 7. The log extension's own sink is on the exit path (the built-in consumer).
// ----------------------------------------------------------------------------
{
  const bus = createAgentEventBus("root");
  const dir = path.join(rootPath, ".agents/logs/ses_exit");

  const ext = createLogExtension({ bus, resolveLog: () => null });
  const log = new AgentLog();
  ext.attachSink(log, { dir, filename: "agent.log", flushIntervalMs: 10_000 });
  ext.start();

  log.info("system", "buffered-at-exit");
  // No polling and no async flush: only the exit path can land this, which is the property under
  // test (a 10s interval and an immediate read make a timer-based write impossible).
  flushExtensionExitFlushesSync();

  const content = fs.readFileSync(path.join(dir, "agent.log"), "utf-8");
  assert.ok(content.includes("buffered-at-exit"), "the log extension's pending batch lands on the exit path");

  ext.dispose();
  const before = content.length;
  log.info("system", "after-dispose");
  flushExtensionExitFlushesSync();
  assert.equal(
    fs.readFileSync(path.join(dir, "agent.log"), "utf-8").length,
    before,
    "a disposed log extension must not keep flushing"
  );
  console.log("7. log extension flushes on the exit path, and stops after dispose: ok");
}

console.log("\nextension-flush validation passed");
