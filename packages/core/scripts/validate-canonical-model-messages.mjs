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

console.log("canonical-model-messages validation passed");
