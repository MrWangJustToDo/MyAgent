/**
 * Validates summary-first message-chain projection.
 *
 * Run: pnpm --filter @my-agent/core run validate:message-chain-projection
 */
import assert from "node:assert/strict";

import {
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

console.log("validate:message-chain-projection OK");
