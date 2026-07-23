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

toModelOutputRegistry.register("write_file", ({ output }) => [
  {
    type: "text",
    content: `${output.created ? "Created" : "Overwrote"} file: ${output.path}，modifiedTime：${output.modifiedTime}`,
  },
]);

const errorMessages = [
  {
    role: "assistant",
    content: null,
    toolCalls: [
      {
        id: "call-err",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "packages/app/src/WorkspacePanel.tsx", content: "x" }),
        },
      },
    ],
  },
  {
    role: "tool",
    toolCallId: "call-err",
    content: JSON.stringify({
      error: "File already exists: packages/app/src/WorkspacePanel.tsx. You must read the file first.",
    }),
  },
];

const errorClone = structuredClone(errorMessages);
await applyToolCompact(errorClone, {
  config: { keepRecentToolResults: 10, minToolResultSize: 1 },
  registry: toModelOutputRegistry,
  cache: new ToolCompactCache(),
});

const errorTool = errorClone.find((m) => m.role === "tool" && m.toolCallId === "call-err");
assert.ok(errorTool);
const errorText =
  typeof errorTool.content === "string"
    ? errorTool.content
    : Array.isArray(errorTool.content)
      ? errorTool.content.map((part) => part.content ?? "").join("")
      : String(errorTool.content);
assert.match(errorText, /Error: File already exists/);
assert.doesNotMatch(errorText, /Overwrote file: undefined/);

// Regression: skipped (too-small) older results must not push compression into the recent window.
const skipIntoRecent = [
  {
    role: "assistant",
    content: null,
    toolCalls: [
      {
        id: "call-small-1",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "s1.ts" }) },
      },
      {
        id: "call-small-2",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "s2.ts" }) },
      },
      {
        id: "call-small-3",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "s3.ts" }) },
      },
      {
        id: "call-big-1",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "b1.ts" }) },
      },
      {
        id: "call-big-2",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "b2.ts" }) },
      },
    ],
  },
  { role: "tool", toolCallId: "call-small-1", content: "tiny" },
  { role: "tool", toolCallId: "call-small-2", content: "tiny" },
  { role: "tool", toolCallId: "call-small-3", content: "tiny" },
  { role: "tool", toolCallId: "call-big-1", content: "B".repeat(200) },
  { role: "tool", toolCallId: "call-big-2", content: "C".repeat(200) },
];

const skipClone = structuredClone(skipIntoRecent);
await applyToolCompact(skipClone, {
  // 5 tools total, keep last 2. Old bug: compressTarget=3, skip 3 tiny, then crush the 2 recent big ones.
  config: { keepRecentToolResults: 2, minToolResultSize: 50 },
  registry: { get: () => undefined },
  cache: new ToolCompactCache(),
});

const recentBig1 = skipClone.find((m) => m.role === "tool" && m.toolCallId === "call-big-1");
const recentBig2 = skipClone.find((m) => m.role === "tool" && m.toolCallId === "call-big-2");
assert.ok(recentBig1);
assert.ok(recentBig2);
assert.equal(recentBig1.content, "B".repeat(200));
assert.equal(recentBig2.content, "C".repeat(200));
assert.doesNotMatch(String(recentBig1.content), /\[Previous: used/);
assert.doesNotMatch(String(recentBig2.content), /\[Previous: used/);

// Placeholders must not consume the keep quota — still preserve N full results.
const quotaMessages = [
  {
    role: "assistant",
    content: null,
    toolCalls: [
      {
        id: "q-old",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "old.ts" }) },
      },
      {
        id: "q-ph",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "ph.ts" }) },
      },
      {
        id: "q-new-1",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "n1.ts" }) },
      },
      {
        id: "q-new-2",
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "n2.ts" }) },
      },
    ],
  },
  { role: "tool", toolCallId: "q-old", content: "O".repeat(200) },
  { role: "tool", toolCallId: "q-ph", content: createToolPlaceholder("read_file") },
  { role: "tool", toolCallId: "q-new-1", content: "N".repeat(200) },
  { role: "tool", toolCallId: "q-new-2", content: "M".repeat(200) },
];

const quotaClone = structuredClone(quotaMessages);
await applyToolCompact(quotaClone, {
  config: { keepRecentToolResults: 2, minToolResultSize: 50 },
  registry: { get: () => undefined },
  cache: new ToolCompactCache(),
});

assert.equal(quotaClone.find((m) => m.toolCallId === "q-old")?.content, createToolPlaceholder("read_file"));
assert.equal(quotaClone.find((m) => m.toolCallId === "q-new-1")?.content, "N".repeat(200));
assert.equal(quotaClone.find((m) => m.toolCallId === "q-new-2")?.content, "M".repeat(200));

console.log("tool-compact validation passed");
