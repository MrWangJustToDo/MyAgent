/**
 * Validation for CoreEnv.commandExists (Node PATH probe).
 *
 * Verifies the probe returns true for a known binary and false for a
 * guaranteed-absent command, and that `createNodeEnv` wires it up.
 *
 * Run: pnpm --filter @my-agent/node run validate:lsp-command-exists
 */

import assert from "node:assert/strict";

import { createNodeEnv } from "../dist/index.mjs";

const env = createNodeEnv({ rootPath: process.cwd() });

// 1. Present command on PATH (Node ships with `node` on PATH when running).
assert.equal(await env.commandExists("node"), true, "node should be on PATH");
assert.equal(await env.commandExists("sh"), true, "sh should be on PATH");

// 2. Guaranteed-absent command.
assert.equal(await env.commandExists("definitely-not-a-real-bin-xyz-123"), false, "absent command should probe false");

// 3. Common LSP server binaries (non-assertive — report for diagnostics).
const probes = ["typescript-language-server", "gopls", "rust-analyzer", "clangd", "bash-language-server"];
const found = [];
for (const bin of probes) {
  if (await env.commandExists(bin)) found.push(bin);
}
console.log(`ℹ️  LSP server binaries found on PATH: ${found.join(", ") || "(none)"}`);

// 4. Project-local resolution: a devDependency-style install under
//    <rootPath>/node_modules/.bin wins over PATH — for the probe and for spawn.
const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const projectDir = mkdtempSync(join(tmpdir(), "lsp-local-bin-"));
const binDir = join(projectDir, "node_modules", ".bin");
mkdirSync(binDir, { recursive: true });

// Minimal handshake-only LSP server with a shebang, so spawning the resolved
// shim exercises the real transport (not just the existence probe).
const serverSource = `#!/usr/bin/env node
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  for (;;) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const match = /Content-Length: (\\d+)/i.exec(buffer.slice(0, headerEnd));
    if (!match) return;
    const start = headerEnd + 4;
    const length = Number(match[1]);
    if (buffer.length < start + length) return;
    const message = JSON.parse(buffer.slice(start, start + length));
    buffer = buffer.slice(start + length);
    if (message.method === "initialize" || message.method === "shutdown") {
      const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result: message.method === "initialize" ? { capabilities: {} } : null });
      process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
});
`;
writeFileSync(join(binDir, "fake-local-language-server"), serverSource, { mode: 0o755 });

const localEnv = createNodeEnv({ rootPath: projectDir });
assert.equal(
  await localEnv.commandExists("fake-local-language-server"),
  true,
  "project-local node_modules/.bin should satisfy the probe"
);

const conn = localEnv.createLspConnection({ command: "fake-local-language-server", args: [], cwd: projectDir });
await conn.start();
assert.equal(conn.initialized, true, "spawn should use the project-local .bin shim");
await conn.shutdown();
assert.equal(conn.disposed, true, "connection should dispose after shutdown");
console.log("ℹ️  project-local node_modules/.bin resolution verified (probe + spawn)");

console.log("lsp-command-exists validation passed");
