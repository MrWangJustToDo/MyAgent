/**
 * Validates tool-compact middleware helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:tool-compact
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  applyToolCompact,
  createToolPlaceholder,
  formatReadFileToolResult,
  toModelOutputRegistry,
  ToolCompactCache,
} from "../dist/dev.mjs";

const cache = new ToolCompactCache();

toModelOutputRegistry.register("read_file", ({ output }) => formatReadFileToolResult(output));
toModelOutputRegistry.register("run_command", ({ output }) => [
  { type: "text", content: `Exit code: ${output.exitCode}` },
  { type: "text", content: output.stdout ?? "" },
]);

const messages = [
  {
    role: "assistant",
    content: "read",
    toolCalls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "a.ts" }) },
      },
      {
        id: "call-2",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "b.ts" }) },
      },
      {
        id: "call-3",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "c.ts" }) },
      },
    ],
  },
  {
    role: "tool",
    toolCallId: "call-1",
    content: JSON.stringify({
      type: "text",
      path: "a.ts",
      content: "alpha",
      totalLines: 1,
      startLine: 1,
      endLine: 1,
      truncated: false,
    }),
  },
  {
    role: "tool",
    toolCallId: "call-2",
    content: JSON.stringify({
      type: "text",
      path: "b.ts",
      content: "beta",
      totalLines: 1,
      startLine: 1,
      endLine: 1,
      truncated: false,
    }),
  },
  {
    role: "tool",
    toolCallId: "call-3",
    content: JSON.stringify({
      type: "text",
      path: "c.ts",
      content: "gamma",
      totalLines: 1,
      startLine: 1,
      endLine: 1,
      truncated: false,
    }),
  },
];

const cloned = structuredClone(messages);

await applyToolCompact(cloned, {
  config: { keepRecentToolResults: 1, minToolResultSize: 1 },
  registry: toModelOutputRegistry,
  cache,
});

const oldest = cloned.find((m) => m.role === "tool" && m.toolCallId === "call-1");
assert.ok(oldest);
assert.equal(oldest.content, createToolPlaceholder("read_file"));
assert.equal(cache.has("call-1"), false);

const newest = cloned.find((m) => m.role === "tool" && m.toolCallId === "call-3");
assert.ok(newest);
assert.equal(
  newest.content,
  JSON.stringify({
    type: "text",
    path: "c.ts",
    content: "gamma",
    totalLines: 1,
    startLine: 1,
    endLine: 1,
    truncated: false,
  })
);
assert.equal(cache.has("call-3"), true);

const replay = structuredClone(messages);
await applyToolCompact(replay, {
  config: { keepRecentToolResults: 1, minToolResultSize: 1 },
  registry: toModelOutputRegistry,
  cache,
});

const replayNewest = replay.find((m) => m.role === "tool" && m.toolCallId === "call-3");
assert.ok(replayNewest);
assert.equal(replayNewest.content, newest.content);

const pendingApproval = [
  {
    role: "assistant",
    content: null,
    toolCalls: [
      {
        id: "call-cmd",
        type: "function",
        function: { name: "run_command", arguments: JSON.stringify({ command: "pnpm lint" }) },
      },
    ],
  },
  {
    role: "tool",
    toolCallId: "call-cmd",
    content: JSON.stringify({
      approved: true,
      pendingExecution: true,
      message: "User approved this action",
    }),
  },
];

const pendingClone = structuredClone(pendingApproval);
await applyToolCompact(pendingClone, {
  config: { keepRecentToolResults: 10, minToolResultSize: 1 },
  registry: toModelOutputRegistry,
  cache: new ToolCompactCache(),
});

const pendingTool = pendingClone.find((m) => m.role === "tool" && m.toolCallId === "call-cmd");
assert.ok(pendingTool);
assert.match(String(pendingTool.content), /pendingExecution/);

console.log("tool-compact validation passed");
