/**
 * Validation for AgentContext UI/model message layering.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-context
 */

import assert from "node:assert/strict";

import { AgentContext } from "../dist/dev.mjs";

const ctx = new AgentContext();

const uiMessages = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "hi" }] },
  { id: "u2", role: "user", parts: [{ type: "text", content: "there" }] },
];

ctx.setUIMessages(uiMessages);
assert.equal(ctx.getUIMessages().length, 2);

const canon = ctx.getCanonicalFromUI();
assert.equal(canon.length, 2);
assert.equal(canon[0].content, "hi");

const forLlm = ctx.getMessagesForLLM(canon);
assert.equal(forLlm.length, 2);

ctx.setSummaryMessage({ role: "user", content: "summary" });
ctx.setCompactIndex(1);
assert.equal(ctx.getMessagesForLLM(canon).length, 2);

ctx.setUIMessages(uiMessages);
assert.equal(ctx.getCanonicalFromUI().length, 2);

console.log("agent-context validation passed");
