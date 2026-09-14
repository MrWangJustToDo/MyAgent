/**
 * Validation: end-to-end auto-diagnostics with REAL typescript-language-server.
 *
 * Verifies the production wiring (ExtensionRunner → createLspExtension) with the
 * real TLS server + real node transport: writing a file with syntax errors via the
 * write interceptor injects `_lspDiagnostics` into the tool result.
 *
 * Run: pnpm --filter @my-agent/core run validate:lsp-real-server
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// This validation needs a real typescript-language-server. Skip gracefully
// instead of failing when it is absent (no global install, no project-local bin).
function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v "${command}" >/dev/null 2>&1`]).status === 0;
}
if (!commandExists("typescript-language-server")) {
  console.log("⚠️  typescript-language-server not found on PATH — skipping real-server validation");
  process.exit(0);
}

// ---- Boot a temp project dir (NOT hidden) with a sample file ----
const projectDir = mkdtempSync(resolve(tmpdir(), "lsp-real-"));
mkdirSync(resolve(projectDir, "src"), { recursive: true });
const sampleFile = resolve(projectDir, "src", "sample.ts");
writeFileSync(
  sampleFile,
  `interface User { id: number; name: string }
function greet(u: User): string {
  return "Hello " + u.name;
}
`
);

// Register CoreEnv (node)
const nodePkg = await import("@my-agent/node");
const core = await import("@my-agent/core");
const env = nodePkg.createNodeEnv({ rootPath: projectDir, cwd: projectDir, platform: "linux" });
core.registerCoreEnv(env);

const coreDistDir = resolve(import.meta.dirname, "..", "dist");
const dev = await import(resolve(coreDistDir, "dev.mjs"));
const { ExtensionRunner } = dev;

const registeredTools = [];
const runner = new ExtensionRunner({
  getEnvVar: () => undefined,
  onRegisterTool: (def) => registeredTools.push(def),
  onRegisterCommand: () => {},
  cwd: projectDir,
  getCoreEnv: () => env,
});

const api = await dev.createLspExtension();
const instance = await runner.loadExtension(api);
record("extension activates (state=active)", instance.state === "active", instance.error?.message ?? "no error");
if (instance.state !== "active") process.exit(1);

const eventBus = runner.getEventBus();
async function syncWrite(filePath, resultText = "ok") {
  await eventBus.emit({
    type: "tool:after:write_file",
    payload: { toolName: "write_file", args: { path: filePath }, result: { text: resultText }, durationMs: 5 },
    defaultReturn: undefined,
  });
}

// ---- Write a file with syntax errors, then trigger the write interceptor ----
const badFile = resolve(projectDir, "src", "bad.ts");
writeFileSync(
  badFile,
  `export function brokenDemo(input: string): string {
  const bad = "unterminated string
  const missingName = ;
  return input.toUpperCase(
}
`
);

await syncWrite(badFile, "wrote bad.ts");

// The write interceptor waits for the server to publish diagnostics for the written file.
// Wait for server startup + analysis.
await new Promise((r) => setTimeout(r, 8000));

const diagTool = registeredTools.find((t) => t.name === "lsp_diagnostics");
let diagOut = "";
for (let attempt = 0; attempt < 30; attempt++) {
  const res = await diagTool.execute({ path: badFile }, { toolCallId: "t1" });
  diagOut = res?.text ?? String(res);
  if (/error/i.test(diagOut)) break;
  if (!/starting|not available|no client/i.test(diagOut)) break;
  await new Promise((r) => setTimeout(r, 500));
}
record(
  "lsp_diagnostics reports real TLS errors after write",
  /error/i.test(diagOut),
  diagOut.slice(0, 200).replace(/\n/g, " ")
);

// ---- Verify the write interceptor injected _lspDiagnostics into the result ----
// Diagnostics are attached to `payload.modifiedResult` (the model-facing result),
// not to the original tool result.
console.log("\n--- auto-diagnostics injection (_lspDiagnostics) ---");

// Re-emit a write event and inspect the modifiedResult the interceptor produces.
const injectedResult = { text: "wrote bad.ts" };
const injEvent = {
  type: "tool:after:write_file",
  payload: { toolName: "write_file", args: { path: badFile }, result: injectedResult, durationMs: 5 },
  defaultReturn: undefined,
};
await eventBus.emit(injEvent);
// The interceptor waits for the publish that follows the write; give it a bit more
// for a warm server to finish analyzing.
await new Promise((r) => setTimeout(r, 4000));
const diagField = injEvent.payload.modifiedResult?._lspDiagnostics;
record(
  "_lspDiagnostics injected into modifiedResult",
  typeof diagField === "string" && /error/i.test(diagField),
  String(diagField ?? "(absent)")
    .slice(0, 200)
    .replace(/\n/g, " ")
);

// ---- Cleanup: shutdown all servers ----
await runner.emitSessionEnd?.("sess-1").catch?.(() => {});
await instance.deactivate?.().catch?.(() => {});
await runner.shutdown?.().catch?.(() => {});

const failed = results.filter((r) => !r.ok);
console.log(`\n=== REAL TLS SERVER VALIDATION ===`);
console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
