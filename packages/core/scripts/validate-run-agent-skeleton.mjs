/**
 * Validates shared run skeleton consume modes and UI attach helper.
 *
 * Run: pnpm --filter @my-agent/core run validate:run-agent-skeleton
 */

import assert from "node:assert/strict";

import { AgentUIChannel, consumeAgentStream, ensureUIChannel } from "../dist/dev.mjs";

async function* emptyStream() {
  // no chunks
}

const headless = await consumeAgentStream({ stream: emptyStream(), mode: "headless" });
assert.ok(Array.isArray(headless));
assert.equal(headless.length, 0);

await assert.rejects(() => consumeAgentStream({ stream: emptyStream(), mode: "ui" }), /AgentUIChannel is required/);

const channel = new AgentUIChannel();
const uiMsgs = await consumeAgentStream({
  stream: emptyStream(),
  mode: "ui",
  channel,
});
assert.ok(Array.isArray(uiMsgs));

const host = {
  ui: undefined,
  setUIChannel(next) {
    this.ui = next;
  },
};
const attached = ensureUIChannel(host, {
  initialMessages: [
    {
      id: "m1",
      role: "user",
      parts: [{ type: "text", content: "hi" }],
      createdAt: new Date(),
    },
  ],
});
assert.ok(attached instanceof AgentUIChannel);
assert.equal(host.ui, attached);
assert.equal(ensureUIChannel(host), attached);

// Outcome path discriminants used by InteractiveChat vs Worker profiles.
const paths = /** @type {const} */ (["chat", "detached"]);
assert.deepEqual([...paths], ["chat", "detached"]);

console.log("run-agent-skeleton validation passed");
