/**
 * Validates extensions middleware always emits lifecycle tool-end/error
 * even when no ExtensionRunner is configured.
 *
 * Run: pnpm --filter @codent/core run validate:extensions-middleware
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

// ---------------------------------------------------------------------------
// A tool that caught its own abort RETURNS, so it reports through `tool-end`.
//
// `info.ok` only means the tool returned, and a cancelled call does exactly that:
// `run_command` settles with `cancelled: true` plus the partial stdout, `task` with
// `aborted: true`. Classifying by the return alone recorded both as clean successes,
// so the verdict has to be read off the output.
// ---------------------------------------------------------------------------

for (const [label, result] of [
  ["run_command's own catch", { command: "x", stdout: "partial", exitCode: -1, success: false, cancelled: true }],
  ["the task tool's marker", { subagentId: "s1", summary: "partial", aborted: true }],
]) {
  events.length = 0;
  await middleware.onBeforeToolCall?.(undefined, { toolName: "run_command", args: {} });
  await middleware.onAfterToolCall?.(undefined, {
    ok: true,
    toolName: "run_command",
    duration: 5,
    result,
    toolCall: { function: { arguments: {} } },
  });

  assert.equal(events[1].type, "agent:tool-end", `${label}: a returned cancel still reports as tool-end`);
  assert.equal(events[1].data?.cancelled, true, `${label}: and the payload says it was a cancel`);
}

// A genuine success must not be labelled a cancel — the flag is read from the output,
// so anything without the marker stays `cancelled: false`.
for (const [label, result] of [
  ["a clean run_command", { command: "x", stdout: "ok", exitCode: 0, success: true }],
  ["a clean task", { subagentId: "s1", summary: "done", aborted: false }],
  ["a tool with no marker at all", { content: "ok" }],
]) {
  events.length = 0;
  await middleware.onAfterToolCall?.(undefined, {
    ok: true,
    toolName: "read_file",
    duration: 5,
    result,
    toolCall: { function: { arguments: {} } },
  });
  assert.equal(events[0].data?.cancelled, false, `${label}: is not reported as a cancel`);
}

console.log("extensions-middleware validation passed");
