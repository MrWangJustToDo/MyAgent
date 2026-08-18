/**
 * Validates that every MESSAGES_SNAPSHOT is dropped so the chronological UI
 * channel is never replaced by TanStack engine wire (summary-first or ordinary).
 *
 * Run: pnpm --filter @my-agent/core run validate:suppress-messages-snapshot
 */

import { EventType } from "@tanstack/ai/client";
import assert from "node:assert/strict";

import { AgentUIChannel, shouldSuppressMessagesSnapshot } from "../dist/dev.mjs";

const SUMMARY = "[CONVERSATION SUMMARY]\n\nprior work\n\n[END SUMMARY]";

function snapshot(messages) {
  return {
    type: EventType.MESSAGES_SNAPSHOT,
    timestamp: Date.now(),
    messages,
  };
}

assert.equal(
  shouldSuppressMessagesSnapshot(
    snapshot([
      { id: "s0", role: "user", content: SUMMARY },
      { id: "s1", role: "user", content: "recent user turn" },
      { id: "s2", role: "assistant", content: "recent reply" },
    ])
  ),
  true,
  "summary-first snapshot must be suppressed"
);

assert.equal(
  shouldSuppressMessagesSnapshot(
    snapshot([
      { id: "s0", role: "user", content: "plain user turn" },
      { id: "s1", role: "assistant", content: "reply" },
    ])
  ),
  true,
  "ordinary snapshot must be suppressed"
);

assert.equal(
  shouldSuppressMessagesSnapshot({
    type: EventType.TEXT_MESSAGE_START,
    messageId: "m1",
    role: "assistant",
    timestamp: Date.now(),
  }),
  false,
  "non-snapshot chunk must pass through"
);

const chronological = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "first task" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", content: "did first task" }],
  },
  { id: "compact-1", role: "user", parts: [{ type: "text", content: SUMMARY }] },
];

async function consumeSnapshot(initialMessages, snapshotMessages) {
  const channel = new AgentUIChannel({ initialMessages });
  async function* interrupt() {
    yield { type: EventType.RUN_STARTED, threadId: "t", runId: "r", timestamp: Date.now() };
    yield snapshot(snapshotMessages);
    yield { type: EventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: Date.now() };
  }
  await channel.consumeRun({ stream: interrupt() });
  return channel.getMessages();
}

{
  const after = await consumeSnapshot(chronological, [
    { id: "snapshot_0", role: "user", content: SUMMARY },
    { id: "snapshot_1", role: "user", content: "first task" },
    { id: "snapshot_2", role: "assistant", content: "did first task" },
  ]);
  assert.equal(after.length, 3, "summary-first snapshot must not replace the channel");
  assert.equal(after[0].id, "u1", "first message must still be the original user turn");
  assert.equal(after[2].id, "compact-1", "summary must stay at the chronological tail");
  assert.equal(after[0].parts[0].content, "first task", "pre-compact history must be preserved");
}

{
  const ordinary = [
    { id: "u1", role: "user", parts: [{ type: "text", content: "hello" }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", content: "hi" }] },
  ];
  const after = await consumeSnapshot(ordinary, [
    { id: "snapshot_0", role: "user", content: "engine rewrite" },
    { id: "snapshot_1", role: "assistant", content: "engine reply" },
  ]);
  assert.equal(after.length, 2, "ordinary snapshot must not replace the channel");
  assert.equal(after[0].id, "u1", "ordinary snapshot must keep the original user id");
  assert.equal(after[0].parts[0].content, "hello", "ordinary snapshot must keep chronological content");
  assert.equal(after[1].id, "a1", "ordinary snapshot must keep the original assistant id");
}

console.log("suppress-messages-snapshot validation passed");
