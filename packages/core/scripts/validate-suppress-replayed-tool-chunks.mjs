/**
 * Validates suppression of TanStack continuation TOOL_CALL_START/ARGS replays.
 *
 * Run: pnpm --filter @my-agent/core run validate:suppress-replayed-tool-chunks
 */

import { EventType } from "@tanstack/ai/client";
import assert from "node:assert/strict";

import { AgentUIChannel, findToolCallPart, shouldSuppressReplayedToolChunk } from "../dist/dev.mjs";

const toolCallId = "call_dup_1";
const messages = [
  {
    id: "asst-1",
    role: "assistant",
    createdAt: new Date(),
    parts: [
      {
        type: "tool-call",
        id: toolCallId,
        name: "run_command",
        arguments: '{"command":"git push"}',
        state: "approval-responded",
        approval: { id: `approval_${toolCallId}`, needsApproval: true, approved: true },
      },
    ],
  },
];

assert.ok(findToolCallPart(messages, toolCallId));
assert.equal(
  shouldSuppressReplayedToolChunk(messages, {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolName: "run_command",
    timestamp: Date.now(),
  }),
  true
);
assert.equal(
  shouldSuppressReplayedToolChunk(messages, {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: "{}",
    timestamp: Date.now(),
  }),
  true
);
assert.equal(
  shouldSuppressReplayedToolChunk(messages, {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    timestamp: Date.now(),
  }),
  false
);
assert.equal(
  shouldSuppressReplayedToolChunk(messages, {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId,
    content: "{}",
    role: "tool",
    timestamp: Date.now(),
  }),
  false
);
assert.equal(
  shouldSuppressReplayedToolChunk(messages, {
    type: EventType.TOOL_CALL_START,
    toolCallId: "call_new",
    toolName: "run_command",
    timestamp: Date.now(),
  }),
  false
);

// Integration: second stream must not clone the tool-call onto another assistant.
const channel = new AgentUIChannel({ initialMessages: messages });
const beforeCount = channel
  .getMessages()
  .flatMap((m) => m.parts)
  .filter((p) => p.type === "tool-call").length;

async function* continuationReplay() {
  yield { type: EventType.RUN_STARTED, threadId: "t", runId: "r2", timestamp: Date.now() };
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolName: "run_command",
    timestamp: Date.now(),
  };
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: '{"command":"git push"}',
    args: '{"command":"git push"}',
    timestamp: Date.now(),
  };
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    toolName: "run_command",
    result: JSON.stringify({ exitCode: 0, stderr: "ok\n", success: true }),
    timestamp: Date.now(),
  };
  yield {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId,
    content: JSON.stringify({ exitCode: 0, stderr: "ok\n", success: true }),
    role: "tool",
    timestamp: Date.now(),
  };
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: "asst-followup",
    role: "assistant",
    timestamp: Date.now(),
  };
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: "asst-followup",
    delta: "Pushed.",
    timestamp: Date.now(),
  };
  yield { type: EventType.TEXT_MESSAGE_END, messageId: "asst-followup", timestamp: Date.now() };
  yield { type: EventType.RUN_FINISHED, threadId: "t", runId: "r2", timestamp: Date.now() };
}

await channel.consumeRun({ stream: continuationReplay() });

const after = channel.getMessages();
const toolCalls = after.flatMap((m) => m.parts).filter((p) => p.type === "tool-call" && p.id === toolCallId);
assert.equal(toolCalls.length, 1, "tool-call id must appear once after continuation replay");
assert.equal(beforeCount, 1);
assert.ok(toolCalls[0].approval?.approved === true, "approval on original part must be preserved");

const followUp = after.find((m) => m.id === "asst-followup");
assert.ok(followUp, "follow-up assistant text message should still be created");
assert.ok(!followUp.parts.some((p) => p.type === "tool-call" && p.id === toolCallId));

console.log("suppress-replayed-tool-chunks validation passed");
