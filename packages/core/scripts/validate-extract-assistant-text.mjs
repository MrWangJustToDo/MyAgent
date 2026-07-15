/**
 * Validates subagent summary extraction and begin_summary-gated streaming.
 *
 * Run: pnpm --filter @my-agent/core run validate:extract-assistant-text
 */

import assert from "node:assert/strict";

import {
  BEGIN_SUMMARY_TOOL_NAME,
  extractAssistantText,
  getSummaryStreamText,
  resolveTaskRunPhase,
  shouldStreamTaskSummary,
} from "../dist/dev.mjs";

const unlocked = { summaryPhaseUnlocked: true };
const locked = { summaryPhaseUnlocked: false };

const summaryText = "## Final Summary\n\nThis is the comprehensive project summary the parent should see.";

const messages = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "I'll start by exploring the project structure." },
      { type: "tool-call", id: "tc1", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "hi", state: "complete" },
      {
        type: "tool-call",
        id: "tc-bs",
        name: BEGIN_SUMMARY_TOOL_NAME,
        arguments: "{}",
        state: "complete",
        output: "{}",
      },
      { type: "tool-result", toolCallId: "tc-bs", content: "{}", state: "complete" },
      { type: "text", content: summaryText },
    ],
  },
];

const summary = extractAssistantText(messages);
assert.ok(summary.includes("## Final Summary"));
assert.ok(!summary.includes("I'll start by exploring"));

assert.equal(getSummaryStreamText(messages[0].parts, locked), null);
assert.equal(getSummaryStreamText(messages[0].parts, unlocked), summary);
assert.equal(resolveTaskRunPhase(messages, unlocked), "summary");
assert.equal(resolveTaskRunPhase(messages, locked), "tools");

const currentTurnNarration = [
  {
    type: "text",
    content:
      "We'll explore the monorepo structure first. We'll delve into core files to understand the agent loop and tool system in detail across packages.",
  },
];

assert.equal(getSummaryStreamText(currentTurnNarration, locked), null);
assert.equal(getSummaryStreamText([{ type: "text", content: "Planning next step." }], unlocked), null);
assert.equal(resolveTaskRunPhase([{ id: "a1", role: "assistant", parts: currentTurnNarration }], locked), "tools");
assert.equal(resolveTaskRunPhase([{ id: "a1", role: "assistant", parts: currentTurnNarration }], unlocked), "summary");

const currentTurnSummary = [{ type: "text", content: summaryText }];

assert.equal(getSummaryStreamText(currentTurnSummary, locked), null);
assert.equal(getSummaryStreamText(currentTurnSummary, unlocked), summaryText);
assert.equal(shouldStreamTaskSummary(currentTurnSummary, unlocked), true);

const toolStillRunning = [{ type: "tool-call", id: "tc3", name: "glob", arguments: "{}", state: "input-complete" }];

assert.equal(getSummaryStreamText(toolStillRunning, unlocked), null);
assert.equal(resolveTaskRunPhase([{ id: "a2", role: "assistant", parts: toolStillRunning }], unlocked), "tools");

const shortFinal = [
  { type: "tool-call", id: "tc4", name: BEGIN_SUMMARY_TOOL_NAME, arguments: "{}", state: "complete", output: "{}" },
  { type: "text", content: "Short" },
];
assert.equal(getSummaryStreamText(shortFinal, unlocked), null);

const reasoningThenSummary = [
  {
    id: "assistant-2",
    role: "assistant",
    parts: [
      {
        type: "thinking",
        content: "我们被要求提供一个总结。我们需要提取目标、指令、发现等信息。",
      },
      {
        type: "text",
        content: "## Goal\n\nFix SubagentPanel issues.\n\n## Accomplished\n\n- Fixed ESC handling",
      },
    ],
  },
];

const summaryWithReasoning = extractAssistantText(reasoningThenSummary);
assert.ok(summaryWithReasoning.startsWith("## Goal"));
assert.ok(!summaryWithReasoning.includes("我们被要求"));

console.log("extract-assistant-text validation passed");
