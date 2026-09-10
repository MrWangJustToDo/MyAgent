/**
 * Validates the retained `interaction` channel derivation:
 * `collectPendingApprovals` / `collectPendingAskUser` (newest message first,
 * terminal/approved calls excluded) plus the channel/meta wiring so hosts can
 * stop re-scanning messages for pending approvals / `ask_user`.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-interaction-channel
 */

import assert from "node:assert/strict";

import {
  AGENT_EVENT_META,
  DEFAULT_AGENT_SESSION_CHANNELS,
  collectPendingApprovals,
  collectPendingAskUser,
} from "../dist/dev.mjs";

function assistant(id, parts) {
  return { id, role: "assistant", parts, createdAt: new Date() };
}
function user(id, parts) {
  return { id, role: "user", parts, createdAt: new Date() };
}
function toolCall(overrides) {
  return { type: "tool-call", state: "input-available", ...overrides };
}

// --- channel / meta wiring ---------------------------------------------------

assert.equal(AGENT_EVENT_META["session:interaction"]?.channel, "interaction", "event maps to the interaction channel");
assert.equal(AGENT_EVENT_META["session:interaction"]?.retained, true, "interaction channel is retained");
assert.equal(DEFAULT_AGENT_SESSION_CHANNELS.includes("interaction"), true, "interaction is a default channel");
assert.equal(DEFAULT_AGENT_SESSION_CHANNELS.includes("mcp"), true, "mcp is a default channel");

// --- pending approvals -------------------------------------------------------

{
  const messages = [
    user("u1", [{ type: "text", content: "go" }]),
    assistant("a1", [
      // Awaiting approval.
      toolCall({
        id: "tc-pending",
        name: "run_command",
        arguments: '{"command":"ls"}',
        approval: { id: "ap-1", needsApproval: true },
      }),
      // Already approved → not pending.
      toolCall({
        id: "tc-approved",
        name: "write_file",
        arguments: "{}",
        approval: { id: "ap-2", needsApproval: true, approved: true },
      }),
      // No approval gate → not pending.
      toolCall({ id: "tc-plain", name: "read_file", arguments: "{}" }),
    ]),
  ];

  assert.deepEqual(collectPendingApprovals(messages), [
    { approvalId: "ap-1", toolName: "run_command", toolCallId: "tc-pending" },
  ]);
}

// Newest message first (matches the previous app/im-bridge message scan order).
{
  const messages = [
    assistant("a1", [
      toolCall({ id: "tc-old", name: "run_command", arguments: "{}", approval: { id: "ap-old", needsApproval: true } }),
    ]),
    user("u2", [{ type: "text", content: "again" }]),
    assistant("a2", [
      toolCall({ id: "tc-new", name: "run_command", arguments: "{}", approval: { id: "ap-new", needsApproval: true } }),
    ]),
  ];
  assert.deepEqual(
    collectPendingApprovals(messages).map((a) => a.approvalId),
    ["ap-new", "ap-old"]
  );
}

// --- pending ask_user --------------------------------------------------------

{
  const messages = [
    assistant("a1", [
      toolCall({
        id: "ask-1",
        name: "ask_user",
        arguments: JSON.stringify({ question: "Which?", options: ["a", "b"], multiSelect: true }),
        state: "input-complete",
      }),
      // Already answered → excluded.
      toolCall({
        id: "ask-2",
        name: "ask_user",
        arguments: JSON.stringify({ question: "done" }),
        state: "input-complete",
        output: { answer: "x" },
      }),
      // Still streaming input → excluded.
      toolCall({
        id: "ask-3",
        name: "ask_user",
        arguments: JSON.stringify({ question: "partial" }),
        state: "input-streaming",
      }),
    ]),
  ];

  assert.deepEqual(collectPendingAskUser(messages), [
    { toolCallId: "ask-1", question: "Which?", options: ["a", "b"], multiSelect: true },
  ]);
}

// Malformed arguments → question falls back to "" and no options are emitted.
{
  const messages = [
    assistant("a1", [toolCall({ id: "ask-bad", name: "ask_user", arguments: "not-json", state: "input-complete" })]),
  ];
  assert.deepEqual(collectPendingAskUser(messages), [{ toolCallId: "ask-bad", question: "" }]);
}

// Empty conversation → empty snapshot parts.
{
  assert.deepEqual(collectPendingApprovals([]), []);
  assert.deepEqual(collectPendingAskUser([]), []);
}

console.log("session-interaction-channel validation passed");
