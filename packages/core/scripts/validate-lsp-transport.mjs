/**
 * Validation: LSP transport layer (node's createLspConnection) against a mock server.
 *
 * Run: pnpm --filter @my-agent/core run validate:lsp-transport
 *
 * Verifies the full client chain that the LSP extension relies on:
 *   - spawn mock LSP server over stdio
 *   - initialize handshake (serverCapabilities populated, initialized=true)
 *   - didOpen / didChange (file-sync) → server pushes diagnostics
 *   - publishDiagnostics callback (diagnostics cached by LspManager)
 *   - hover / documentSymbol / completion / codeAction / definition / references
 *   - shutdown (graceful) and process cleanup
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER = resolve(__dirname, "mock-lsp-server.mjs");

// Import the production transport via the built @my-agent/node package.
const nodePkg = await import("@my-agent/node");
const env = nodePkg.createNodeEnv({ rootPath: "/tmp", cwd: "/tmp", platform: "linux" });
assert.equal(typeof env.createLspConnection, "function", "createNodeEnv must expose createLspConnection");
assert.equal(typeof env.locateTreeSitterGrammar, "function", "createNodeEnv must expose locateTreeSitterGrammar");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- 1. createLspConnection + initialize handshake ----
const config = {
  command: process.execPath, // node
  args: [MOCK_SERVER],
  cwd: "/tmp",
};
const conn = env.createLspConnection(config);

try {
  await conn.start();
  record("connection.start() completes", true);
} catch (err) {
  record("connection.start() completes", false, String(err));
}

assert.equal(conn.initialized, true, "conn.initialized should be true after start");
record("conn.initialized === true after handshake", conn.initialized === true);

const caps = conn.serverCapabilities;
assert.ok(caps && typeof caps === "object", "serverCapabilities from initialize");
record(
  "serverCapabilities populated",
  !!caps,
  caps ? `hover=${caps.hoverProvider} def=${caps.definitionProvider} symbols=${caps.documentSymbolProvider}` : ""
);

// ---- 2. publishDiagnostics callback (server→client push) ----
const pushed = new Map(); // uri -> diagnostics
conn.onPublishDiagnostics((uri, diagnostics) => {
  pushed.set(uri, diagnostics);
});

const uri = "file:///tmp/sample.ts";
const goodCode = 'const x: number = 1;\nfunction hello(): string { return "hi"; }\n';
conn.didOpen(uri, "typescript", 1, goodCode);

// Give the server a moment to push diagnostics.
await new Promise((r) => setTimeout(r, 300));
record("publishDiagnostics received for clean doc", pushed.has(uri), pushed.has(uri) ? "[] diags" : "not pushed");
assert.deepEqual(pushed.get(uri) ?? [], [], "clean doc should have zero diagnostics");

// ---- 3. didChange → re-push with a marker (error + warning) ----
const badCode = 'const x: number = 1; // ERR\nfunction hello(): string { // WARN\n  return "hi";\n}\n';
conn.didChange(uri, 2, badCode);
await new Promise((r) => setTimeout(r, 300));

const badDiags = pushed.get(uri) ?? [];
const hasError = badDiags.some((d) => d.severity === 1 && /ERR/.test(d.message ?? ""));
const hasWarning = badDiags.some((d) => d.severity === 2 && /WARN/.test(d.message ?? ""));
record("didChange triggers error+warning diagnostics", hasError && hasWarning, `${badDiags.length} diags`);

// ---- 4. hover / symbols / completion / codeAction / definition / references ----
const hover = await conn.sendRequest("textDocument/hover", {
  textDocument: { uri },
  position: { line: 1, character: 10 },
});
record("textDocument/hover returns contents", !!hover?.contents, hover?.contents?.value ?? "");

const symbols = await conn.sendRequest("textDocument/documentSymbol", { textDocument: { uri } });
record(
  "textDocument/documentSymbol returns functions",
  Array.isArray(symbols) && symbols.some((s) => s.name === "hello")
);

const completion = await conn.sendRequest("textDocument/completion", {
  textDocument: { uri },
  position: { line: 0, character: 0 },
});
record(
  "textDocument/completion returns array",
  Array.isArray(completion),
  `[${completion.map((c) => c.label).join(",")}]`
);

const actions = await conn.sendRequest("textDocument/codeAction", {
  textDocument: { uri },
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  context: { diagnostics: [] },
});
record("textDocument/codeAction returns array", Array.isArray(actions), actions[0]?.title ?? "");

const def = await conn.sendRequest("textDocument/definition", {
  textDocument: { uri },
  position: { line: 0, character: 0 },
});
record("textDocument/definition returns location", !!def?.uri || !!def?.range);

const refs = await conn.sendRequest("textDocument/references", {
  textDocument: { uri },
  position: { line: 0, character: 0 },
  context: { includeDeclaration: true },
});
record("textDocument/references returns locations", Array.isArray(refs) && refs.length > 0, `${refs.length} refs`);

// ---- 5. workspace/configuration request from server (client responds) ----
// (Transport registers a handler; nothing to assert without a server asking, so skip.)

// ---- 6. graceful shutdown ----
let exitFired = false;
conn.onUnexpectedExit(() => {
  exitFired = true;
});
await conn.shutdown();
record("shutdown() completes gracefully", true);
record("conn.disposed === true after shutdown", conn.disposed === true);
assert.equal(conn.disposed, true, "disposed after shutdown");

// ---- 7. unexpected-exit path: spawn a server that exits immediately ----
const crashConn = env.createLspConnection({
  command: process.execPath,
  args: ["-e", "process.exit(0)"],
  cwd: "/tmp",
});
const exitCode = await new Promise((resolveExit) => {
  crashConn.onUnexpectedExit((code) => resolveExit(code));
  crashConn.start().catch(() => resolveExit(null));
});
record("onUnexpectedExit fires on server crash", exitCode !== undefined && exitCode !== null, `exit code=${exitCode}`);

// ---- Summary ----
const failed = results.filter((r) => !r.ok);
console.log("\n=== LSP TRANSPORT VALIDATION ===");
console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
if (failed.length > 0) {
  console.log("Failures:");
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log("All transport checks passed ✅");
