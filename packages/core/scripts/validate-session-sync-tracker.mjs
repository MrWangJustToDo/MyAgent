/**
 * Validation for checkpoint-based session UIMessage persistence.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-sync-tracker
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  areAllUIMessagesStable,
  computeSessionSyncSnapshot,
  createSessionSyncTracker,
  fingerprintUIMessage,
  isUIMessageStable,
  shouldPersistUIMessages,
} from "../dist/dev.mjs";

const userMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", content: "hello" }],
};

const streamingAssistant = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "text", content: "partial" },
    {
      type: "tool-call",
      id: "call_1",
      name: "read_file",
      arguments: '{"path":"a.ts"}',
      state: "input-streaming",
    },
  ],
};

const stableAssistant = {
  id: "a2",
  role: "assistant",
  parts: [
    { type: "text", content: "done" },
    {
      type: "tool-call",
      id: "call_2",
      name: "run_command",
      arguments: "{}",
      state: "approval-requested",
      approval: { id: "approval_1", needsApproval: true },
    },
  ],
};

assert.equal(isUIMessageStable(userMessage), true);
assert.equal(isUIMessageStable(streamingAssistant), false);
assert.equal(isUIMessageStable(stableAssistant), true);
assert.equal(isUIMessageStable({ id: "empty", role: "assistant", parts: [] }), false);

const fp1 = fingerprintUIMessage(userMessage);
const fp2 = fingerprintUIMessage({ ...userMessage, parts: [{ type: "text", content: "hello!" }] });
assert.notEqual(fp1, fp2);

const tracker = createSessionSyncTracker();
assert.equal(tracker.shouldPersist([userMessage], { reason: "checkpoint", agentStatus: "running" }), true);
tracker.markPersisted([userMessage]);
assert.equal(tracker.shouldPersist([userMessage], { reason: "checkpoint", agentStatus: "idle" }), false);

assert.equal(
  shouldPersistUIMessages([userMessage, streamingAssistant], tracker.getSnapshot(), {
    reason: "checkpoint",
    agentStatus: "responding",
  }),
  false
);

assert.equal(
  shouldPersistUIMessages([userMessage, stableAssistant], tracker.getSnapshot(), {
    reason: "checkpoint",
    agentStatus: "waiting",
  }),
  true
);

assert.equal(
  shouldPersistUIMessages([userMessage, stableAssistant], null, {
    reason: "pump-complete",
    agentStatus: "running",
  }),
  true
);

const snap = computeSessionSyncSnapshot([userMessage, stableAssistant]);
assert.equal(snap.messageCount, 2);
assert.equal(snap.fingerprints.length, 2);

console.log("session-sync-tracker validation passed");
