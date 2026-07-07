/**
 * Validates final-step summary extraction from subagent UIMessage snapshots.
 *
 * Run: pnpm --filter @my-agent/core run validate:extract-assistant-text
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { extractAssistantText, getSummaryStreamText } from "../dist/dev.mjs";

const messages = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", content: "I'll start by exploring the project structure." },
      { type: "tool-call", id: "tc1", name: "read_file", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc1", content: "hi", state: "complete" },
      { type: "text", content: "Now let me read package.json files." },
      { type: "tool-call", id: "tc2", name: "grep", arguments: "{}", state: "complete", output: "{}" },
      { type: "tool-result", toolCallId: "tc2", content: "[]", state: "complete" },
      {
        type: "text",
        content: "## Final Summary\n\nThis is the comprehensive project summary the parent should see.",
      },
    ],
  },
];

const summary = extractAssistantText(messages);
assert.ok(summary.includes("## Final Summary"));
assert.ok(!summary.includes("I'll start by exploring"));
assert.ok(!summary.includes("Now let me read"));

const streamText = getSummaryStreamText(messages[0].parts);
assert.equal(streamText, summary);

const shortFinal = [
  { type: "tool-call", id: "tc3", name: "glob", arguments: "{}", state: "complete", output: "[]" },
  { type: "tool-result", toolCallId: "tc3", content: "[]", state: "complete" },
  { type: "text", content: "Short" },
];
assert.equal(getSummaryStreamText(shortFinal), null);

console.log("extract-assistant-text validation passed");
