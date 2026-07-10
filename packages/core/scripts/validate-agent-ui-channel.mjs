/**
 * Validates AgentUIChannel stream → UIMessage[] conversion (text, tool-call, tool-result).
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-ui-channel
 */
/* eslint-disable no-undef */
import { EventType } from "@tanstack/ai/client";
import assert from "node:assert/strict";

import { AgentUIChannel } from "../dist/dev.mjs";

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

console.log("agent-ui-channel validation passed");
