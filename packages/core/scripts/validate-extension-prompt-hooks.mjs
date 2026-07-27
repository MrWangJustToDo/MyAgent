/**
 * Validation for extension prompt-hook helpers (join + collectBeforeAgentStart).
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-prompt-hooks
 */

import assert from "node:assert/strict";

import { ExtensionRunner, joinExtensionAppendSegments } from "../dist/dev.mjs";

assert.equal(joinExtensionAppendSegments(), undefined);
assert.equal(joinExtensionAppendSegments("  ", null, undefined), undefined);
assert.equal(joinExtensionAppendSegments("A", "B"), "A\n\nB");
assert.equal(joinExtensionAppendSegments("  A  ", "", "B"), "A\n\nB");

const runner = new ExtensionRunner({ getEnvVar: () => undefined });

await runner.loadExtension({
  id: "ext-a",
  name: "A",
  version: "1.0.0",
  description: "first",
  activate(ctx) {
    ctx.registerInterceptor("before_agent_start", (event) => {
      event.appendTurnContext = "turn-A";
      event.appendSystemPrompt = "sys-A";
    });
    ctx.registerTurnContextProvider(() => "provider-A");
  },
});

await runner.loadExtension({
  id: "ext-b",
  name: "B",
  version: "1.0.0",
  description: "second",
  activate(ctx) {
    ctx.registerInterceptor("before_agent_start", (event) => {
      event.appendTurnContext = "turn-B";
      event.appendSystemPrompt = "   ";
    });
    ctx.registerTurnContextProvider(() => undefined);
  },
});

const collected = await runner.collectBeforeAgentStart("hello world", "agent-1");
// Handlers first (registration order), then providers (registration order).
assert.equal(collected.turnContext, "turn-A\n\nturn-B\n\nprovider-A");
assert.equal(collected.systemAppend, "sys-A");

const emptyRunner = new ExtensionRunner({ getEnvVar: () => undefined });
const empty = await emptyRunner.collectBeforeAgentStart("x", "id");
assert.equal(empty.turnContext, undefined);
assert.equal(empty.systemAppend, undefined);

console.log("extension-prompt-hooks validation passed");
