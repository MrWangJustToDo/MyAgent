/**
 * Validation for explicit-trigger session UIMessage persistence.
 *
 * Run: pnpm --filter @codent/core run validate:session-sync-tracker
 */

import assert from "node:assert/strict";

import {
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
assert.equal(tracker.shouldPersist([userMessage], { reason: "user-message" }), true);
tracker.markPersisted([userMessage]);
assert.equal(tracker.shouldPersist([userMessage], { reason: "user-message" }), false);
assert.equal(tracker.shouldPersist([userMessage], { reason: "pump-complete" }), false);

assert.equal(
  shouldPersistUIMessages([userMessage, streamingAssistant], tracker.getSnapshot(), {
    reason: "user-message",
  }),
  true
);

assert.equal(
  shouldPersistUIMessages([userMessage, stableAssistant], tracker.getSnapshot(), {
    reason: "pump-complete",
  }),
  true
);

tracker.markPersisted([userMessage, stableAssistant]);
assert.equal(
  shouldPersistUIMessages([userMessage, stableAssistant], tracker.getSnapshot(), {
    reason: "force",
  }),
  false
);

const snap = computeSessionSyncSnapshot([userMessage, stableAssistant]);
assert.equal(snap.messageCount, 2);
assert.equal(snap.fingerprints.length, 2);

// ---------------------------------------------------------------------------
// A late-attached tool display must register as a change
// ---------------------------------------------------------------------------
// The display payload is attached by `attachToolDisplay` AFTER the tool part has
// settled, and the message body never changes again. Without it in the fingerprint
// `shouldPersist` answers "no change" and the display never reaches disk, so a
// restored transcript renders the raw output instead of the folded row.
{
  const toolCall = {
    id: "a3",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_3",
        name: "read_file",
        arguments: '{"path":"a.ts"}',
        state: "complete",
        output: { ok: true },
      },
    ],
  };

  const withDisplay = {
    ...toolCall,
    parts: [{ ...toolCall.parts[0], display: { category: "file", summary: "read a.ts" } }],
  };

  assert.notEqual(
    fingerprintUIMessage(toolCall),
    fingerprintUIMessage(withDisplay),
    "attaching a display payload must change the fingerprint"
  );

  const displayTracker = createSessionSyncTracker();
  displayTracker.markPersisted([toolCall]);
  assert.equal(
    displayTracker.shouldPersist([withDisplay], { reason: "pump-complete" }),
    true,
    "a late display attach must trigger a persist"
  );
}

// A part type this switch does not know must still be content-sensitive, or a
// future part type would never be written (its content change looked like no-op).
// Role `user` deliberately: an assistant message whose only part is unknown is
// treated as an empty shell (that guard is separate and intentional).
{
  const unknownA = { id: "m4", role: "user", parts: [{ type: "future-part", value: "one" }] };
  const unknownB = { id: "m4", role: "user", parts: [{ type: "future-part", value: "two" }] };
  assert.notEqual(
    fingerprintUIMessage(unknownA),
    fingerprintUIMessage(unknownB),
    "an unhandled part type must fingerprint its content, not just its type"
  );
}

console.log("session-sync-tracker validation passed");
