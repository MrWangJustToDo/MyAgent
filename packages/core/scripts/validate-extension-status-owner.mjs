/**
 * Validation for ExtensionRunner status ownership cleanup.
 *
 * Covers:
 * - ctx.ui.setStatus writes a status entry and notifies `set-status`
 * - the status is attributed to the owning extension (via the per-extension UI wrapper)
 * - disabling the extension (setEnabled(false) → destroyExtension) clears its status
 *   entries and notifies the host with an empty text (remove signal)
 * - statuses from a different extension survive
 * - destroyAll clears every status entry
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-status-owner
 */

import assert from "node:assert/strict";

import { ExtensionRunner } from "../dist/dev.mjs";

// --- Helpers: a fake extension factory that writes a status on activate ---------
function statusExtension(id, key, text) {
  return {
    id,
    name: id,
    version: "1.0.0",
    description: "status-writing test extension",
    async activate(ctx) {
      ctx.ui.setStatus(key, text);
    },
  };
}

const notifications = [];
const runner = new ExtensionRunner({
  getEnvVar: () => undefined,
});

// Subscribe to the shared UI (as a host would).
runner.getUI().subscribe("set-status", (data) => notifications.push(data));

// --- Activate two extensions that each write their own status -------------------
const extA = statusExtension("ext-a", "lsp", "LSP: typescript ready");
const extB = statusExtension("ext-b", "mem", "memory: 12 items");

await runner.loadExtension(extA);
await runner.loadExtension(extB);

assert.deepEqual(
  runner.getUI().getStatus(),
  {
    lsp: "LSP: typescript ready",
    mem: "memory: 12 items",
  },
  "both extensions' status entries are present"
);

// --- Disabling ext-a clears only its own status -------------------------------
notifications.length = 0;
const result = await runner.setEnabled("ext-a", false);
assert.equal(result.ok, true, "disabling ext-a succeeds");

const statusAfterDisable = runner.getUI().getStatus();
assert.deepEqual(statusAfterDisable, { mem: "memory: 12 items" }, "ext-a status cleared, ext-b status remains");

const removalNotifs = notifications.filter((n) => n.text === "");
assert.ok(
  removalNotifs.some((n) => n.key === "lsp"),
  "host received an empty set-status for the disabled extension's key"
);

// --- Re-enabling ext-a re-writes its status (owner re-attribution works) --------
await runner.setEnabled("ext-a", true);
assert.deepEqual(
  runner.getUI().getStatus(),
  {
    lsp: "LSP: typescript ready",
    mem: "memory: 12 items",
  },
  "re-enabling ext-a restores its status"
);

// --- destroyAll clears everything ----------------------------------------------
notifications.length = 0;
await runner.destroyAll();
assert.deepEqual(runner.getUI().getStatus(), {}, "destroyAll clears every status entry");
assert.ok(notifications.filter((n) => n.text === "").length >= 2, "destroyAll notifies removal for every status entry");

console.log("extension-status-owner validation passed");
