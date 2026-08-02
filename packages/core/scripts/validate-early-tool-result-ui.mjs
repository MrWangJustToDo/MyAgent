/**
 * Validates early-tool-result-ui middleware mirrors each tool finish into the UI channel.
 *
 * Run: pnpm --filter @my-agent/core run validate:early-tool-result-ui
 */

import assert from "node:assert/strict";

import { createEarlyToolResultUiMiddleware } from "../dist/dev.mjs";

const calls = [];

const channel = {
  addToolResult(toolCallId, output, error) {
    calls.push({ toolCallId, output, error });
  },
};

const middleware = createEarlyToolResultUiMiddleware({
  getUIChannel: () => channel,
});

await middleware.onAfterToolCall?.(undefined, {
  ok: true,
  toolName: "task",
  toolCallId: "call_1",
  duration: 100,
  result: { summary: "done", success: true },
  toolCall: { id: "call_1", function: { name: "task", arguments: "{}" } },
});

assert.equal(calls.length, 1);
assert.deepEqual(calls[0], {
  toolCallId: "call_1",
  output: { summary: "done", success: true },
  error: undefined,
});

calls.length = 0;

await middleware.onAfterToolCall?.(undefined, {
  ok: false,
  toolName: "run_command",
  toolCallId: "call_2",
  duration: 5,
  error: new Error("boom"),
  toolCall: { id: "call_2", function: { name: "run_command", arguments: "{}" } },
});

assert.equal(calls.length, 1);
assert.deepEqual(calls[0], {
  toolCallId: "call_2",
  output: { error: "boom" },
  error: "boom",
});

calls.length = 0;

const noChannel = createEarlyToolResultUiMiddleware({
  getUIChannel: () => null,
});

await noChannel.onAfterToolCall?.(undefined, {
  ok: true,
  toolName: "task",
  toolCallId: "call_3",
  duration: 1,
  result: { ok: true },
  toolCall: { id: "call_3", function: { name: "task", arguments: "{}" } },
});

assert.equal(calls.length, 0);

console.log("early-tool-result-ui validation passed");
