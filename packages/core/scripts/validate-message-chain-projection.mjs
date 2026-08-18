/**
 * Validates summary-first message-chain projection.
 *
 * Run: pnpm --filter @my-agent/core run validate:message-chain-projection
 */
import { convertMessagesToModelMessages } from "@tanstack/ai";
import assert from "node:assert/strict";

import {
  AgentUIChannel,
  createCompactionSummaryUIMessage,
  findCutPoint,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryUIMessage,
} from "../dist/dev.mjs";

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

// No summary → identity
{
  const messages = [user("a"), assistant("b"), user("c")];
  const visible = getModelVisibleMessages(messages, { keepRecentFlows: 2 });
  assert.deepEqual(visible, messages);
}

// Summary-first with look-back
{
  const summary = { role: "user", content: formatCompactionSummaryContent("prior work done") };
  const messages = [
    user("old1"),
    assistant("r1"),
    user("old2"),
    assistant("r2"),
    user("keep1"),
    assistant("rk1"),
    user("keep2"),
    assistant("rk2"),
    summary,
    user("after"),
    assistant("ra"),
  ];

  assert.equal(findLatestSummaryIndex(messages), 8);
  assert.ok(isCompactionSummaryModelMessage(summary));

  const visible = getModelVisibleMessages(messages, { keepRecentFlows: 2 });
  assert.equal(visible[0], summary);
  assert.equal(visible[1].content, "keep1");
  assert.equal(visible[visible.length - 2].content, "after");
  assert.ok(!visible.some((m) => m.content === "old1"));
}

// findCutPoint skips summary + turn_context
{
  const messages = [
    user("u1"),
    assistant("a1"),
    user("<turn_context>\nx\n</turn_context>"),
    user("u2"),
    assistant("a2"),
    { role: "user", content: formatCompactionSummaryContent("s") },
    user("u3"),
  ];
  const cut = findCutPoint(messages, 2);
  assert.equal(messages[cut].content, "u2");
}

// UIMessage detector
{
  const ui = createCompactionSummaryUIMessage("hello");
  assert.ok(isCompactionSummaryUIMessage(ui));
}

// Post-compact same-request wire: convert the chronological channel, then
// project. Channel order stays chronological; wire is summary-first. No
// engine/baseline merge.
{
  const channel = new AgentUIChannel({
    initialMessages: [
      { id: "u1", role: "user", parts: [{ type: "text", content: "old1" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", content: "r1" }] },
      { id: "u2", role: "user", parts: [{ type: "text", content: "keep1" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", content: "rk1" }] },
      { id: "u3", role: "user", parts: [{ type: "text", content: "keep2" }] },
      { id: "a3", role: "assistant", parts: [{ type: "text", content: "rk2" }] },
    ],
  });
  channel.setMessages([...channel.getMessages(), createCompactionSummaryUIMessage("prior work done")]);

  const afterAppend = channel.getMessages();
  assert.equal(afterAppend[0].id, "u1", "channel must stay chronological after compact append");
  assert.ok(isCompactionSummaryUIMessage(afterAppend[afterAppend.length - 1]));

  const wire = getModelVisibleMessages(convertMessagesToModelMessages(afterAppend), { keepRecentFlows: 2 });
  assert.ok(isCompactionSummaryModelMessage(wire[0]), "wire must start with the latest summary");
  assert.equal(typeof wire[1]?.content === "string" ? wire[1].content : "", "keep1");
  assert.ok(!wire.some((m) => typeof m.content === "string" && m.content === "old1"));
  assert.equal(channel.getMessages()[0].id, "u1", "projection must not write wire order back to the channel");
}

console.log("validate:message-chain-projection OK");
