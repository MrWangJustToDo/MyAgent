/**
 * Validates tool denial reason attachment for approval responses.
 *
 * Run: pnpm --filter @my-agent/core run validate:tool-denial-reason
 */
/* eslint-disable no-undef */
import { uiMessageToModelMessages } from "@tanstack/ai";
import assert from "node:assert/strict";

import { AgentUIChannel, applyToolDenialReason, needsAgentResponseAfterTools } from "../dist/dev.mjs";

const approvalId = "approval_call_cmd";
const initialMessages = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_cmd",
        name: "run_command",
        arguments: '{"command":"rm -rf /"}',
        state: "approval-requested",
        approval: { id: approvalId, needsApproval: true },
      },
    ],
  },
];

const channel = new AgentUIChannel({ initialMessages });
channel.addToolApprovalResponse(approvalId, false, "Too destructive for this workspace");

const messages = channel.getMessages();
const assistant = messages[0];
const toolCall = assistant.parts.find((part) => part.type === "tool-call");
const denialResult = assistant.parts.find((part) => part.type === "tool-result");

assert.equal(toolCall?.approval?.approved, false);
assert.equal(toolCall?.approval?.reason, "Too destructive for this workspace");
assert.ok(denialResult, "expected tool-result part for denial");
assert.equal(denialResult.toolCallId, "call_cmd");
assert.deepEqual(JSON.parse(denialResult.content), {
  approved: false,
  message: "Too destructive for this workspace",
});

assert.equal(needsAgentResponseAfterTools(messages), true);

const modelMessages = uiMessageToModelMessages(assistant);
const toolMessage = modelMessages.find((message) => message.role === "tool");
assert.ok(toolMessage, "expected model tool message for denial");
assert.deepEqual(JSON.parse(toolMessage.content), {
  approved: false,
  message: "Too destructive for this workspace",
});

const reapplied = applyToolDenialReason(messages, approvalId, "duplicate");
assert.equal(reapplied[0].parts.filter((part) => part.type === "tool-result").length, 1);

console.log("tool-denial-reason validation passed");
