/**
 * Validates suppression of summary-first MESSAGES_SNAPSHOT replays.
 *
 * After compaction, an interrupt snapshot carries the summary-first wire
 * projection (summary at index 0). Overwriting the chronological channel with
 * that collapses pre-compact history and moves the summary to the head.
 *
 * Run: pnpm --filter @my-agent/core run validate:suppress-summary-first-snapshot
 */

import { EventType } from "@tanstack/ai/client";
import assert from "node:assert/strict";

import { AgentUIChannel, shouldSuppressSummaryFirstSnapshot } from "../dist/dev.mjs";

const SUMMARY = "[CONVERSATION SUMMARY]\n\nprior work\n\n[END SUMMARY]";

function snapshot(messages) {
  return {
    type: EventType.MESSAGES_SNAPSHOT,
    timestamp: Date.now(),
    messages,
  };
}

// --- Unit: summary-first projection must be suppressed ----------------------
assert.equal(
  shouldSuppressSummaryFirstSnapshot(
    snapshot([
      { id: "s0", role: "user", content: SUMMARY },
      { id: "s1", role: "user", content: "recent user turn" },
      { id: "s2", role: "assistant", content: "recent reply" },
    ])
  ),
  true,
  "summary-first snapshot must be suppressed"
);

// Non-summary head → not suppressed.
assert.equal(
  shouldSuppressSummaryFirstSnapshot(
    snapshot([
      { id: "s0", role: "user", content: "plain user turn" },
      { id: "s1", role: "assistant", content: "reply" },
    ])
  ),
  false,
  "ordinary snapshot must pass through"
);

// Non-MESSAGES_SNAPSHOT chunk → not suppressed.
assert.equal(
  shouldSuppressSummaryFirstSnapshot({
    type: EventType.TEXT_MESSAGE_START,
    messageId: "m1",
    role: "assistant",
    timestamp: Date.now(),
  }),
  false,
  "non-snapshot chunk must pass through"
);

// --- Integration: a summary-first snapshot must NOT overwrite the channel ---
const chronological = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "first task" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", content: "did first task" }],
  },
  // Summary appended at the tail (chronological, as applyCompactionResult does).
  { id: "compact-1", role: "user", parts: [{ type: "text", content: SUMMARY }] },
];

const channel = new AgentUIChannel({ initialMessages: chronological });

async function* interruptWithSummaryFirstSnapshot() {
  yield { type: EventType.RUN_STARTED, threadId: "t", runId: "r", timestamp: Date.now() };
  yield snapshot([
    { id: "snapshot_0", role: "user", content: SUMMARY },
    { id: "snapshot_1", role: "user", content: "first task" },
    { id: "snapshot_2", role: "assistant", content: "did first task" },
  ]);
  yield { type: EventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: Date.now() };
}

await channel.consumeRun({ stream: interruptWithSummaryFirstSnapshot() });

const after = channel.getMessages();
assert.equal(after.length, 3, "channel must retain pre-compact + summary messages");
assert.equal(after[0].id, "u1", "first message must still be the original user turn");
assert.equal(after[2].id, "compact-1", "summary must stay at the chronological tail");
assert.equal(after[0].parts[0].content, "first task", "pre-compact history must be preserved");

console.log("suppress-summary-first-snapshot validation passed");
