/**
 * Validates extensions middleware always emits lifecycle tool-end/error
 * even when no ExtensionRunner is configured.
 *
 * Run: pnpm --filter @my-agent/core run validate:extensions-middleware
 */

import assert from "node:assert/strict";

import { createExtensionsMiddleware } from "../dist/dev.mjs";

const events = [];

const middleware = createExtensionsMiddleware({
  getExtensionRunner: () => null,
  getSessionId: () => "session-1",
  emitEvent: (type, data) => events.push({ type, data }),
});

await middleware.onBeforeToolCall?.(undefined, {
  toolName: "read_file",
  args: { path: "a.ts" },
});

await middleware.onAfterToolCall?.(undefined, {
  ok: true,
  toolName: "read_file",
  duration: 12,
  result: { content: "ok" },
  toolCall: { function: { arguments: { path: "a.ts" } } },
});

assert.equal(events.length, 2);
assert.equal(events[0].type, "agent:tool-start");
assert.equal(events[1].type, "agent:tool-end");
assert.equal(events[1].data?.tool_name, "read_file");
assert.equal(events[1].data?.duration_ms, 12);

events.length = 0;

await middleware.onBeforeToolCall?.(undefined, {
  toolName: "run_command",
  args: { command: "false" },
});

await middleware.onAfterToolCall?.(undefined, {
  ok: false,
  toolName: "run_command",
  duration: 3,
  error: new Error("exit 1"),
  toolCall: { function: { arguments: { command: "false" } } },
});

assert.equal(events.length, 2);
assert.equal(events[0].type, "agent:tool-start");
assert.equal(events[1].type, "agent:tool-error");
assert.equal(events[1].data?.error, "exit 1");

console.log("extensions-middleware validation passed");
