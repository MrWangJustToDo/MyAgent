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

console.log("lsp-command-exists validation passed");
