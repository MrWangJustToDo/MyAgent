/**
 * Validation: LSP server lifecycle — session:start/session:shutdown cleanup.
 *
 * Run: pnpm --filter @codent/core run validate:lsp-lifecycle
 *
 * Server startup is LAZY (triggered by an LSP tool call, not by read_file —
 * read_file only didOpen's an already-running server). This validation:
 *   1. activate extension (node CoreEnv + mock server)
 *   2. call lsp_diagnostics → lazy-start mock server (child process)
 *   3. session:start (new cwd) → old manager shutdownAll (old child gone)
 *   4. call lsp_diagnostics in new cwd → new server starts
 *   5. session:shutdown → all children gone (ps shows 0 mock-lsp-server)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const MOCK_SERVER = resolve(import.meta.dirname, "mock-lsp-server.mjs");
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function countMockProcesses() {
  try {
    // Match only real mock-server child processes (node .../mock-lsp-server.mjs).
    // pgrep -f would also match its own command line, so anchor on a node invocation.
    const out = execFileSync("pgrep", ["-f", "node.*mock-lsp-server\\.mjs$"], {
      encoding: "utf-8",
    });
    return out.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0; // pgrep exits 1 when no match
  }
}

function waitForCount(target, attempts = 20, delayMs = 250) {
  return new Promise((resolveP) => {
    let n = 0;
    const tick = () => {
      const c = countMockProcesses();
      if (c === target || n++ >= attempts) return resolveP(c);
      setTimeout(tick, delayMs);
    };
    tick();
  });
}

// ---- Setup project dirs ----
const projectA = mkdtempSync(resolve(tmpdir(), "lsp-lifecycle-a-"));
const projectB = mkdtempSync(resolve(tmpdir(), "lsp-lifecycle-b-"));
for (const p of [projectA, projectB]) {
  writeFileSync(
    resolve(p, ".lsp.json"),
    JSON.stringify({ servers: { typescript: { command: process.execPath, args: [MOCK_SERVER] } } })
  );
  writeFileSync(resolve(p, "a.ts"), "export const a: number = 1;\n");
}

// ---- Wire up ----
const nodePkg = await import("@codent/node");
const core = await import("@codent/core");
const env = nodePkg.createNodeEnv({ rootPath: projectA, cwd: projectA, platform: "linux" });
core.registerCoreEnv(env);

const coreDistDir = resolve(import.meta.dirname, "..", "dist");
const dev = await import(resolve(coreDistDir, "dev.mjs"));
const { ExtensionRunner } = dev;

const registeredTools = [];
const runner = new ExtensionRunner({
  getEnvVar: () => undefined,
  onRegisterTool: (def) => registeredTools.push(def),
  cwd: projectA,
  getCoreEnv: () => env,
});
await runner.loadExtension(await dev.createLspExtension());
const diagTool = registeredTools.find((t) => t.name === "lsp_diagnostics");

// Other LSP validators use the same mock server, and a crashed run can leave one
// behind. Count deltas against this run's baseline instead of absolute counts so
// an unrelated leftover process cannot fail these assertions.
const baseline = countMockProcesses();

// ---- 1. lsp_diagnostics triggers lazy start in project A ----
await diagTool.execute({ path: resolve(projectA, "a.ts") }, { toolCallId: "t1" });
const afterA = await waitForCount(baseline + 1);
record("lsp_diagnostics lazy-starts mock server (A)", afterA === baseline + 1, `${afterA - baseline} new process(es)`);
// Let the server finish its initialize handshake so a later shutdown() is clean.
await new Promise((r) => setTimeout(r, 1200));

// ---- 2. session:start with a NEW cwd (project B) → old server torn down ----
await runner.emitSessionStart(projectB, "sess-1");
// emitSessionStart is fire-and-forget (void emit); wait for shutdown to complete.
const afterStartB = await waitForCount(baseline, 30, 200);
record(
  "session:start tears down old manager's server",
  afterStartB === baseline,
  `${afterStartB - baseline} left (baseline ${baseline})`
);

// ---- 3. lsp_diagnostics in project B → new server starts ----
await diagTool.execute({ path: resolve(projectB, "a.ts") }, { toolCallId: "t2" });
const afterB = await waitForCount(baseline + 1);
record(
  "lsp_diagnostics starts server for new manager (B)",
  afterB === baseline + 1,
  `${afterB - baseline} new process(es)`
);

// ---- 4. session:shutdown → all servers torn down ----
await runner.emitSessionShutdown("sess-1");
const afterShutdown = await waitForCount(baseline, 40, 200);
record(
  "session:shutdown tears down all servers",
  afterShutdown === baseline,
  `${afterShutdown - baseline} left (baseline ${baseline})`
);

await runner.destroyAll();
core.clearCoreEnv();

const failed = results.filter((r) => !r.ok);
console.log("\n=== LSP LIFECYCLE VALIDATION ===");
console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log("All lifecycle checks passed ✅");
process.exit(0);
