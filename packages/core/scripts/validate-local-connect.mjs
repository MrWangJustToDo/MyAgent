/**
 * Validates localConnect + ChatClient stream → UIMessage[] wiring with a mock stream.
 *
 * Run: pnpm --filter @my-agent/core run validate:local-connect
 */
/* eslint-disable no-undef, import/no-useless-path-segments */
import { EventType } from "@tanstack/ai/client";
import { ChatClient } from "@tanstack/ai-client";
import assert from "node:assert/strict";

import { createLocalConnect } from "../dist/index.mjs";

const threadId = "thread-test";
const runId = "run-test";
const messageId = "assistant-msg-1";

function mockAgentStream() {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
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
      delta: "Hello from mock stream",
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
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      timestamp: Date.now(),
      finishReason: "stop",
      model: "mock",
    };
  })();
}

const mockManager = {
  runAgentStream(_agentId, input) {
    assert.ok(input.messages);
    return mockAgentStream();
  },
};

const connection = createLocalConnect("agent-test", mockManager);
const client = new ChatClient({ connection, threadId });

await client.sendMessage("Hi");

const deadline = Date.now() + 5000;
while (client.getIsLoading() && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10));
}

assert.equal(client.getIsLoading(), false, "ChatClient should finish loading");

const messages = client.getMessages();
assert.ok(messages.length >= 2, "expected user + assistant messages");

const assistant = messages.find((m) => m.role === "assistant");
assert.ok(assistant, "assistant message missing");

const text = assistant.parts
  .filter((p) => p.type === "text")
  .map((p) => p.content)
  .join("");

assert.ok(text.includes("Hello from mock stream"), `unexpected assistant text: ${text}`);

console.log("local-connect validation passed");
