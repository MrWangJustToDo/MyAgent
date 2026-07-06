/**
 * Validates final-step summary extraction from subagent UIMessage snapshots.
 *
 * Run: pnpm --filter @my-agent/core run validate:extract-assistant-text
 */
/* eslint-disable no-undef, import/no-useless-path-segments */
import assert from "node:assert/strict";

import { extractAssistantText, getSummaryStreamText } from "../dist/index.mjs";

const messages = [
  {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "analyze project" }],
  },
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", text: "I'll start by exploring the project structure." },
      { type: "step-start" },
      {
        type: "tool-read_file",
        toolCallId: "t1",
        state: "output-available",
        input: { path: "README.md" },
        output: { content: "hi" },
      },
      { type: "step-start" },
      { type: "text", text: "Now let me read package.json files." },
      {
        type: "tool-grep",
        toolCallId: "t2",
        state: "output-available",
        input: { pattern: "foo" },
        output: { matches: [] },
      },
      { type: "step-start" },
      {
        type: "text",
        text: "## Final Summary\n\nThis is the comprehensive project summary the parent should see.",
      },
    ],
  },
];

const summary = extractAssistantText(messages);
assert.ok(summary.includes("## Final Summary"));
assert.ok(!summary.includes("I'll start by exploring"));
assert.ok(!summary.includes("Now let me read"));

const streamText = getSummaryStreamText(messages[1].parts);
assert.equal(streamText, summary);

const shortFinal = [{ type: "step-start" }, { type: "text", text: "Short" }];
assert.equal(getSummaryStreamText(shortFinal), null);

console.log("extract-assistant-text validation passed");
