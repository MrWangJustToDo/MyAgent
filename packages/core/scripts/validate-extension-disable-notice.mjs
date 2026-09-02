/**
 * Validation for the extension-API-driven disabled-notice (`ExtensionAPI.disabledNotice`).
 *
 * Verifies that disabling at runtime injects the extension's custom notice into
 * turn-context; that undefined/absent falls back to a generic notice; that an empty
 * string opts out entirely; and that re-enabling clears the notice.
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-disable-notice
 */

import assert from "node:assert/strict";

import {
  ExtensionRunner,
  createCodeModeExtension,
  createLspExtension,
  createMcpExtension,
  createMemoryExtension,
  createSkillsExtension,
} from "../dist/dev.mjs";

async function collect(runner, id) {
  await runner.setEnabled(id, false);
  const collected = await runner.collectBeforeAgentStart("x", "id");
  return collected.turnContext ?? "";
}

// 1. Custom notice via disabledNotice().
{
  const runner = new ExtensionRunner({ getEnvVar: () => undefined });
  await runner.loadExtension({
    id: "custom",
    name: "Custom Ext",
    version: "1.0.0",
    description: "custom notice",
    activate() {},
    disabledNotice() {
      return "Custom ext is switched off — its widgets are gone.";
    },
  });
  const text = await collect(runner, "custom");
  assert.match(text, /Custom ext is switched off/);
  assert.ok(!/disabled — its tools/.test(text), "should use custom, not default");
}

// 2. No disabledNotice -> generic default (still informative).
{
  const runner = new ExtensionRunner({ getEnvVar: () => undefined });
  await runner.loadExtension({
    id: "plain",
    name: "Plain Ext",
    version: "1.0.0",
    description: "no custom notice",
    activate() {},
  });
  const text = await collect(runner, "plain");
  assert.match(text, /Plain Ext.*is disabled/);
}

// 3. Empty string -> opt out (no notice at all).
{
  const runner = new ExtensionRunner({ getEnvVar: () => undefined });
  await runner.loadExtension({
    id: "muted",
    name: "Muted Ext",
    version: "1.0.0",
    description: "silent on disable",
    activate() {},
    disabledNotice() {
      return "   ";
    },
  });
  const text = await collect(runner, "muted");
  assert.equal(text, "", "empty/whitespace disabledNotice should inject nothing");
}

// 4. Re-enabling clears the notice.
{
  const runner = new ExtensionRunner({ getEnvVar: () => undefined });
  await runner.loadExtension({
    id: "toggle",
    name: "Toggle Ext",
    version: "1.0.0",
    description: "clear on enable",
    activate() {},
    disabledNotice() {
      return "toggle is off";
    },
  });
  await runner.setEnabled("toggle", false);
  const off = await runner.collectBeforeAgentStart("x", "id");
  assert.match(off.turnContext ?? "", /toggle is off/);
  await runner.setEnabled("toggle", true);
  const on = await runner.collectBeforeAgentStart("x", "id");
  assert.equal(on.turnContext ?? "", "", "notice cleared after re-enable");
}

// 5. All built-in extensions define a custom disabledNotice (extension-API mode).
//    Only lsp/code-mode have no injected deps; the rest use stub managers since
//    disabledNotice() is a pure method that never touches them.
{
  const stubs = {}; // managers are unused by disabledNotice()
  const builtins = [
    createLspExtension(),
    createCodeModeExtension(),
    createMemoryExtension({ memoryManager: stubs }),
    createSkillsExtension({ skillRegistry: stubs }),
    createMcpExtension({ mcpManager: stubs }),
  ];
  for (const api of builtins) {
    assert.equal(typeof api.disabledNotice, "function", `${api.id} must expose disabledNotice()`);
    const text = api.disabledNotice?.();
    assert.equal(typeof text, "string");
    assert.ok(text.trim().length > 0, `${api.id} disabledNotice() must be non-empty`);
  }
}

console.log("extension-disable-notice validation passed");
