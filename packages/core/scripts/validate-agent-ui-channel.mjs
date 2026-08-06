/**
 * Validates AgentUIChannel stream → UIMessage[] conversion (text, tool-call, tool-result).
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-ui-channel
 */

import { EventType } from "@tanstack/ai/client";
import assert from "node:assert/strict";

import { AgentUIChannel, SummaryStreamHub, summaryStreamKey } from "../dist/dev.mjs";

const threadId = "thread-ui";
const runId = "run-ui";
const messageId = "assistant-ui-1";
const toolCallId = "tool-call-1";

function mockRunStream() {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
    };
    yield {
      type: EventType.CUSTOM,
      name: "subagent-progress",
      value: { pct: 25 },
      threadId,
      runId,
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
      threadId,
      runId,
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: "Checking files...",
      threadId,
      runId,
    };
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      threadId,
      runId,
    };
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolName: "read_file",
      messageId,
      threadId,
      runId,
    };
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta: '{"path":"README.md"}',
      threadId,
      runId,
    };
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      threadId,
      runId,
    };
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId,
      content: "# Project",
      threadId,
      runId,
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      timestamp: Date.now(),
      finishReason: "stop",
      model: "mock",
    };
  })();
}

const customEvents = [];
const channel = new AgentUIChannel({
  onCustomEvent: (eventType, data) => {
    customEvents.push({ eventType, data });
  },
});

let updateCount = 0;
const unsubscribe = channel.subscribe(() => {
  updateCount++;
});

const messages = await channel.consumeRun({ stream: mockRunStream() });
assert.ok(updateCount >= 1, "subscribe should receive message updates");

unsubscribe();

assert.equal(messages.length, 1);
const assistant = messages[0];
assert.equal(assistant.role, "assistant");

const partTypes = assistant.parts.map((p) => p.type);
assert.ok(partTypes.includes("text"), "expected text part");
assert.ok(partTypes.includes("tool-call"), "expected tool-call part");
assert.ok(partTypes.includes("tool-result"), "expected tool-result part");

const text = assistant.parts
  .filter((p) => p.type === "text")
  .map((p) => p.content)
  .join("");
assert.ok(text.includes("Checking files"), `unexpected text: ${text}`);

const toolCall = assistant.parts.find((p) => p.type === "tool-call");
assert.equal(toolCall?.name, "read_file");

assert.equal(customEvents.length, 1);
assert.equal(customEvents[0].eventType, "subagent-progress");

const emptyChannel = new AgentUIChannel({
  initialMessages: [
    {
      id: "assistant-deny",
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          id: "call_cmd",
          name: "run_command",
          arguments: "{}",
          state: "approval-responded",
          approval: { id: "approval_1", needsApproval: true, approved: false },
        },
        {
          type: "tool-result",
          toolCallId: "call_cmd",
          content: JSON.stringify({ approved: false, message: "no" }),
          state: "complete",
        },
      ],
    },
  ],
});

await emptyChannel.consumeRun({
  stream: (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId: "thread-empty",
      runId: "run-empty",
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-empty",
      role: "assistant",
      threadId: "thread-empty",
      runId: "run-empty",
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: "thread-empty",
      runId: "run-empty",
      timestamp: Date.now(),
      finishReason: "stop",
      model: "mock",
    };
  })(),
});

assert.equal(emptyChannel.getMessages().length, 1);
assert.equal(emptyChannel.getMessages()[0].id, "assistant-deny");

// ============================================================================
// Summary stream via SummaryStreamHub (no UIMessage diff / emitStreamingChunk).
// ============================================================================

const summaryStreamId = "task-1";
const summaryMsgId = "assistant-summary";
const longText = "x".repeat(200);

const summaryHub = new SummaryStreamHub();
/** @type {import("../dist/dev.mjs").SummaryStreamEvent[]} */
const summaryEvents = [];
const unsubSummary = summaryHub.subscribe((event) => summaryEvents.push(event));

const summaryChannel = new AgentUIChannel();
await summaryChannel.consumeRun({
  stream: (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId: "thread-summary",
      runId: "run-summary",
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: summaryMsgId,
      role: "assistant",
      threadId: "thread-summary",
      runId: "run-summary",
    };
    // Unlock summary phase via begin_summary
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: "tc-bs",
      toolName: "begin_summary",
      messageId: summaryMsgId,
      threadId: "thread-summary",
      runId: "run-summary",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: summaryMsgId,
      delta: longText.slice(0, 100),
      threadId: "thread-summary",
      runId: "run-summary",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: summaryMsgId,
      delta: longText.slice(100),
      threadId: "thread-summary",
      runId: "run-summary",
    };
    // Transient tool segment — must NOT reset or clear the summary hub stream.
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: "tc-2",
      toolName: "read_file",
      messageId: summaryMsgId,
      threadId: "thread-summary",
      runId: "run-summary",
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: "thread-summary",
      runId: "run-summary",
      timestamp: Date.now(),
      finishReason: "stop",
      model: "mock",
    };
  })(),
  parentTaskToolCallId: summaryStreamId,
  streamingAgentId: "agent-parent",
  summaryHub,
});

const summaryKey = summaryStreamKey("task", summaryStreamId);
const summarySnap = summaryHub.getSnapshot(summaryKey);
assert.ok(summarySnap, "expected summary snapshot");
assert.equal(summarySnap.status, "ended");
assert.equal(summarySnap.pendingLine, longText, "full text should accumulate in pendingLine (no newlines)");
assert.equal(summaryEvents.filter((e) => e.type === "reset").length, 1, "exactly one reset (begin_summary)");
assert.ok(
  summaryEvents.some((e) => e.type === "append"),
  "expected append events"
);
assert.equal(summaryEvents.filter((e) => e.type === "end").length, 1, "exactly one end");
unsubSummary();

// ============================================================================
// Trailing-newline growth must stay monotonic (no shrink→clear→restream).
// ============================================================================

const monoHub = new SummaryStreamHub();
/** @type {string[]} */
const monoAppends = [];
const unsubMono = monoHub.subscribe((event) => {
  if (event.type === "append") monoAppends.push(event.chunk);
});

const monoBase = "B".repeat(80);
const monoChannel = new AgentUIChannel();
await monoChannel.consumeRun({
  stream: (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId: "thread-mono",
      runId: "run-mono",
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-mono",
      role: "assistant",
      threadId: "thread-mono",
      runId: "run-mono",
    };
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: "tc-bs-mono",
      toolName: "begin_summary",
      messageId: "assistant-mono",
      threadId: "thread-mono",
      runId: "run-mono",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-mono",
      delta: monoBase,
      threadId: "thread-mono",
      runId: "run-mono",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-mono",
      delta: "\n",
      threadId: "thread-mono",
      runId: "run-mono",
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-mono",
      delta: "line2\nline3\nline4\nline5\nline6",
      threadId: "thread-mono",
      runId: "run-mono",
    };
    yield {
      type: EventType.RUN_FINISHED,
      threadId: "thread-mono",
      runId: "run-mono",
      timestamp: Date.now(),
      finishReason: "stop",
      model: "mock",
    };
  })(),
  parentTaskToolCallId: "task-mono",
  streamingAgentId: "agent-mono",
  summaryHub: monoHub,
});

const monoJoined = monoAppends.join("");
assert.equal(monoJoined, monoBase + "\nline2\nline3\nline4\nline5\nline6");
const monoSnap = monoHub.getSnapshot(summaryStreamKey("task", "task-mono"));
assert.ok(monoSnap);
assert.equal(monoSnap.status, "ended");
assert.deepEqual(monoSnap.lines, [monoBase, "line2", "line3", "line4", "line5"]);
assert.equal(monoSnap.pendingLine, "line6");
unsubMono();

console.log("agent-ui-channel validation passed");
