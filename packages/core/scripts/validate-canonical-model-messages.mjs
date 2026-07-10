/**
 * Validation for canonical model message rebuilding (compaction dual-view).
 *
 * Run: pnpm --filter @my-agent/core run validate:canonical-model-messages
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { AgentContext, buildCanonicalModelMessages } from "../dist/dev.mjs";

const uiMessages = Array.from({ length: 69 }, (_, i) => ({
  id: `u${i}`,
  role: "user",
  parts: [{ type: "text", content: `message ${i}` }],
}));

const fromUI = buildCanonicalModelMessages(uiMessages, [], 0);
assert.equal(fromUI.length, 69);

const runBaseline = 69;
const summaryMessage = { role: "user", content: "[CONVERSATION SUMMARY]\nold\n[END SUMMARY]" };
const compactIndex = 40;
const engineTail = [
  ...Array.from({ length: 29 }, (_, i) => ({ role: "user", content: `message ${i + compactIndex}` })),
  {
    role: "assistant",
    content: "working",
    toolCalls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } }],
  },
  { role: "tool", toolCallId: "c1", content: "file contents" },
];
const compactedEngine = [summaryMessage, ...engineTail];

const canon = buildCanonicalModelMessages(uiMessages, compactedEngine, {
  runBaselineCount: runBaseline,
  summaryMessage,
  compactIndex,
});
assert.equal(canon.length, 71, "preserved prefix + compacted engine tail");
assert.equal(canon[39]?.content, "message 39");
assert.equal(canon[40]?.content, "message 40");
assert.equal(canon[69]?.role, "assistant");

const ctx = new AgentContext();
ctx.setUIMessages(uiMessages);
ctx.setRunBaselineCount(runBaseline);
ctx.setSummaryMessage(summaryMessage);
ctx.setCompactIndex(compactIndex);

const llmView = ctx.getMessagesForLLM(ctx.getCanonicalModelMessages(compactedEngine));
assert.equal(llmView.length, 32, "summary + canon.slice(40) with in-run tool messages");
assert.match(String(llmView[0].content), /CONVERSATION SUMMARY/);
assert.equal(llmView[1]?.content, "message 40");

const secondPass = ctx.getMessagesForLLM(ctx.getCanonicalModelMessages(llmView));
assert.equal(secondPass.length, 32, "second onConfig must not double-slice truncated engine state");

const grownEngine = [...compactedEngine, { role: "assistant", content: "next step" }];
const regrownCanon = ctx.getCanonicalModelMessages(grownEngine);
assert.equal(regrownCanon.length, 72, "in-run growth after compacted engine view is preserved");
assert.equal(ctx.getMessagesForLLM(regrownCanon).length, 33);

const fullEngine = Array.from({ length: runBaseline }, (_, i) => ({
  role: "user",
  content: `message ${i}`,
}));
assert.equal(
  buildCanonicalModelMessages(uiMessages, fullEngine, { runBaselineCount: runBaseline }).length,
  runBaseline,
  "full engine at run start maps to converted UI history"
);

// In-place tool result update: engine length unchanged, content differs from stale UI conversion.
const toolUiMessages = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "test" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_cmd",
        name: "run_command",
        arguments: '{"command":"pnpm typecheck"}',
        state: "approval-responded",
        approval: { id: "ap1", needsApproval: true, approved: true },
      },
    ],
  },
];
const engineWithResults = [
  { role: "user", content: "test" },
  {
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "call_cmd",
        type: "function",
        function: { name: "run_command", arguments: '{"command":"pnpm typecheck"}' },
      },
    ],
  },
  { role: "tool", toolCallId: "call_cmd", content: "Exit status 1\nlint output..." },
];
const inPlaceCanon = buildCanonicalModelMessages(toolUiMessages, engineWithResults, {
  runBaselineCount: 2,
});
assert.equal(inPlaceCanon.length, 3, "engine suffix appended when engine grew");
assert.equal(inPlaceCanon[2]?.content, "Exit status 1\nlint output...");

const sameLengthEngine = buildCanonicalModelMessages(toolUiMessages, engineWithResults, {
  runBaselineCount: engineWithResults.length,
});
assert.equal(sameLengthEngine, engineWithResults, "prefer engine when length equals baseline (in-place tool results)");
assert.equal(sameLengthEngine[2]?.content, "Exit status 1\nlint output...");

console.log("canonical-model-messages validation passed");
