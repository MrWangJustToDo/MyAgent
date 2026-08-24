/**
 * Validates reactive compaction helpers and compaction start event kinds.
 *
 * Requires a prior package build (`pnpm run build`) so imports resolve from `dist/dev.mjs`.
 * This smoke does not call a live model — it only checks status/event wiring.
 *
 * Run: pnpm --filter @my-agent/core run validate:reactive-compact
 */

import assert from "node:assert/strict";

import {
  isPromptTooLongError,
  extractRunErrorMessage,
  createAgentStatusController,
  reactiveCompact,
} from "../dist/dev.mjs";

assert.equal(isPromptTooLongError(new Error("prompt_too_long")), true);
assert.equal(isPromptTooLongError(new Error("context length exceeded")), true);
assert.equal(isPromptTooLongError(new Error("network timeout")), false);

assert.equal(extractRunErrorMessage({ type: "TEXT_MESSAGE_CONTENT", delta: "hi" }), "");
assert.equal(
  extractRunErrorMessage({ type: "RUN_ERROR", message: "prompt_too_long: request too large" }),
  "prompt_too_long: request too large"
);
assert.equal(extractRunErrorMessage({ type: "RUN_ERROR", error: { message: "too many tokens" } }), "too many tokens");

const events = [];
let status = "running";

const statusController = createAgentStatusController({
  getStatus: () => status,
  setStatus: (next) => {
    status = next;
  },
  getError: () => "",
  setError: () => {},
  setPendingApprovalCount: () => {},
  emitEvent: (type, data) => events.push({ type, data }),
});

statusController.beginCompaction("auto");
assert.equal(status, "compacting");
assert.deepEqual(
  events.map((e) => e.type),
  ["compaction:auto-start"]
);

events.length = 0;
status = "running";
statusController.beginCompaction("reactive", { retry: 1, maxRetries: 1 });
assert.equal(status, "compacting");
assert.deepEqual(
  events.map((e) => e.type),
  ["compaction:reactive-start"]
);
assert.equal(events[0].data?.retry, 1);
assert.ok(!events.some((e) => e.type === "compaction:auto-start"));

console.log("reactive-compact validation passed");

// ============================================================================
// Token-budget tail (replaces the fixed 5-message count)
// ============================================================================

// Manager whose getAgent throws — reactiveCompact must fall back to the static
// emergency summary instead of propagating, so we can exercise tail selection.
const throwingManager = {
  getAgent: () => {
    throw new Error("no registry in this test");
  },
};

function bigToolConversation() {
  const messages = [];
  let callId = 0;
  for (let turn = 0; turn < 3; turn++) {
    messages.push({ role: "user", content: `task ${turn} — ${"u".repeat(2_000)}` });
    for (let i = 0; i < 3; i++) {
      messages.push({
        role: "assistant",
        content: [{ type: "text", content: "working" }],
        toolCalls: [{ id: `c${callId}`, type: "function", function: { name: "run_command", arguments: "{}" } }],
      });
      messages.push({
        role: "tool",
        toolCallId: `c${callId}`,
        content: [{ type: "text", content: "r".repeat(6_000) }],
      });
      callId++;
    }
  }
  return messages;
}

{
  const messages = bigToolConversation();
  const result = await reactiveCompact(messages, "agent-x", throwingManager, { keepRecentTokens: 8_000 });

  // Progress guaranteed: something was summarized.
  assert.ok(result.length < messages.length, "tail budget must shrink the wire");
  assert.equal(result[0].role, "user");
  assert.ok(String(result[0].content).includes("[Emergency reactive compaction performed."));

  // Tail is pairing-safe: every kept tool result has its call kept too.
  const tail = result.slice(1);
  const keptCallIds = new Set(tail.flatMap((m) => (m.toolCalls ?? []).map((tc) => tc.id)));
  for (const m of tail) {
    if (m.role === "tool") assert.ok(keptCallIds.has(m.toolCallId), "orphaned tool result in reactive tail");
  }
  assert.notEqual(tail[0].role, "tool", "tail must not start on a tool result");
  console.log(`token-budget tail kept ${tail.length}/${messages.length} messages with intact pairs`);
}

// Emergency degrade: everything fits the budget → still cut at a safe boundary.
{
  const small = Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `msg ${i}` }));
  const result = await reactiveCompact(small, "agent-y", throwingManager, { keepRecentTokens: 1_000_000 });
  assert.equal(result.length, 2, "degrade keeps only the last valid boundary message");
  assert.equal(result[1].content, "msg 9");
  console.log("emergency degrade path (cut even when input fits budget) OK");
}

console.log("reactive token-budget validation passed");
