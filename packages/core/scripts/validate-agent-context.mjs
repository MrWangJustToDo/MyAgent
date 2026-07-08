/**
 * Validation for AgentContext UI/model message layering.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-context
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { AgentContext } from "../dist/dev.mjs";

const ctx = new AgentContext();

const uiMessages = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "call_1",
        name: "run_command",
        arguments: "{}",
        state: "approval-responded",
        approval: { id: "approval_call_1", needsApproval: true, approved: true },
      },
    ],
  },
];

ctx.setUIMessages(uiMessages);
assert.equal(ctx.getUIMessages().length, 2);

const model = ctx.getMessages();
assert.ok(model.some((m) => m.role === "tool"));
const toolMsg = model.find((m) => m.role === "tool" && m.toolCallId === "call_1");
assert.ok(toolMsg);
assert.match(String(toolMsg.content), /pendingExecution/);

const forLlm = ctx.getMessagesForLLM();
assert.equal(forLlm.length, model.length);

ctx.setSummaryMessage({ role: "user", content: "summary" });
ctx.setCompactIndex(1);
assert.equal(ctx.getMessagesForLLM().length, model.length);

ctx.setMessages([{ role: "user", content: "compacted" }]);
assert.equal(ctx.getMessages()[0].content, "compacted");

ctx.setUIMessages(uiMessages);
assert.ok(ctx.getMessages().some((m) => m.role === "tool"));

console.log("agent-context validation passed");
