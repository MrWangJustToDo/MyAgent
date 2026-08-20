/**
 * Validation for LspManager probe-before-spawn behavior.
 *
 * Covers:
 * - Missing server binary → probe skips spawn, no throw, onServerError fired
 * - getStatus marks unavailable with a human reason
 * - Present binary → proceeds past the probe to the connection factory
 * - Spawn ENOENT → translated to a friendly actionable message
 *
 * Run: pnpm --filter @my-agent/core run validate:lsp-server-probe
 */

import assert from "node:assert/strict";

import { LspManager } from "../dist/dev.mjs";

const path = {
  join: (...p) => p.join("/"),
  resolve: (...p) => "/" + p.join("/"),
};
const fs = {
  existsSync: async () => false,
  readFile: async () => "",
  readdir: async () => [],
};

let spawnAttempts = 0;
const getConnection = () => {
  spawnAttempts++;
  throw new Error("should never be reached when probe skips");
};

const errors = [];
const manager = new LspManager(
  "/repo",
  getConnection,
  path,
  fs,
  undefined,
  {
    onServerError: (lang, msg) => errors.push(`${lang}: ${msg}`),
  },
  undefined,
  async (cmd) => cmd === "typescript-language-server"
);

// 1. Missing binary → probe skips start (no spawn, no throw), reports once.
manager.setServerConfig("go", { command: "gopls", args: ["serve"] });
const client = await manager.waitForClient("go", 3000);
assert.equal(client, null);
assert.equal(spawnAttempts, 0);
assert.equal(errors.length, 1);

// 2. getStatus marks the missing-binary server unavailable with a reason.
const status = manager.getStatus().find((s) => s.languageId === "go");
assert.ok(status);
assert.equal(status.available, false);
assert.match(status.unavailableReason ?? "", /not found on PATH/);

// 3. Present binary → proceeds past probe to the connection factory.
let reachedConnection = false;
manager.setConnectionFactory(() => {
  reachedConnection = true;
  return {
    languageId: "typescript",
    initialized: false,
    disposed: false,
    start: async () => {
      throw new Error("ENOENT (simulated)");
    },
    sendRequest: async () => undefined,
    sendNotification: () => {},
    didOpen: () => {},
    didChange: () => {},
    onUnexpectedExit: () => {},
    onPublishDiagnostics: () => {},
    shutdown: async () => {},
    request: async () => undefined,
    notify: () => {},
  };
});
manager.setServerConfig("typescript", { command: "typescript-language-server", args: ["--stdio"] });
await manager.getClientForLanguage("typescript").catch(() => {});
// startServer runs fire-and-forget and awaits the probe, so let it settle.
await new Promise((r) => setTimeout(r, 50));
assert.equal(reachedConnection, true);

// 4. Spawn ENOENT → friendly actionable message in onServerError.
const enoentError = errors.find((e) => e.includes("not found on PATH"));
assert.ok(enoentError, "expected an ENOENT-friendly onServerError message");

// 5. probeCommand result is cached (second call does not re-invoke the probe).
let probeCalls = 0;
const countingManager = new LspManager("/repo", getConnection, path, fs, undefined, undefined, undefined, async () => {
  probeCalls++;
  return true;
});
await countingManager.probeCommand("clangd");
await countingManager.probeCommand("clangd");
assert.equal(probeCalls, 1);

console.log("lsp-server-probe validation passed");
