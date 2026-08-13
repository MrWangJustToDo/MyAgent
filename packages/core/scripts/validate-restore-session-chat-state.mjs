/**
 * Validates mid-session restore chat alignment (clear queues + sync interaction).
 *
 * Run: pnpm --filter @my-agent/core run validate:restore-session-chat-state
 */
import assert from "node:assert/strict";

import { applyRestoredSessionChatState } from "../dist/dev.mjs";

const uiMessages = [{ id: "m1", role: "user", parts: [{ type: "text", content: "hi" }] }];

/** @type {{ queuesCleared: boolean, synced: unknown }} */
const host = {
  queuesCleared: false,
  synced: null,
  clearQueuedMessages() {
    host.queuesCleared = true;
  },
  syncInteractionStateFromUIMessages(messages) {
    host.synced = messages;
  },
};

applyRestoredSessionChatState(host, uiMessages);

assert.equal(host.queuesCleared, true);
assert.equal(host.synced, uiMessages);

console.log("restore-session-chat-state validation passed");
