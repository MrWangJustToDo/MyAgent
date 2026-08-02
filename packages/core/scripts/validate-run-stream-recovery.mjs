/**
 * Validates stream recovery orchestrator (runStreamWithRecovery + helpers).
 *
 * Run: pnpm --filter @my-agent/core run validate:run-stream-recovery
 */

import assert from "node:assert/strict";

import { messagesForModelCapabilities, retryDelayMs, runStreamWithRecovery } from "../dist/dev.mjs";

async function* onlyRunError() {
  yield { type: "RUN_ERROR", message: "quota exceeded" };
}

let threw = false;
try {
  for await (const chunk of runStreamWithRecovery({
    managed: { parentId: "sub", usage: { hasCapability: () => true } },
    manager: {},
    getMessages: () => [],
    run: () => onlyRunError(),
  })) {
    assert.ok(chunk.type !== "RUN_ERROR");
  }
} catch (error) {
  threw = true;
  assert.equal(error instanceof Error ? error.message : String(error), "quota exceeded");
}
assert.equal(threw, true);

const managed = {
  usage: null,
  log: null,
};
const msgs = [{ role: "user", content: "hi" }];
assert.equal(messagesForModelCapabilities(managed, msgs), msgs);

const delay0 = retryDelayMs(0);
assert.ok(delay0 >= 500 && delay0 <= 500 * 1.25);
assert.equal(retryDelayMs(0, 2), 2000);

console.log("run-stream-recovery validation passed");
