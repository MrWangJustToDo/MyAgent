/**
 * Validates RUN_ERROR fail-fast helpers used by main chat and subagents.
 *
 * Run: pnpm --filter @my-agent/core run validate:stream-errors
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  AgentUIChannel,
  extractRunErrorMessage,
  runStreamWithReactiveCompactRetry,
  throwOnRunError,
} from "../dist/dev.mjs";

assert.equal(extractRunErrorMessage({ type: "TEXT_MESSAGE_CONTENT", delta: "hi" }), "");
assert.equal(extractRunErrorMessage({ type: "RUN_ERROR", message: "upstream failed" }), "upstream failed");
assert.equal(extractRunErrorMessage({ type: "RUN_ERROR", error: { message: "boom" } }), "boom");

async function* okThenError() {
  yield { type: "RUN_STARTED", runId: "r1", threadId: "t1" };
  yield { type: "RUN_ERROR", message: "model rejected multimodal request" };
  yield { type: "RUN_FINISHED", runId: "r1", threadId: "t1" };
}

let threw = false;
try {
  for await (const chunk of throwOnRunError(okThenError())) {
    assert.ok(chunk.type !== "RUN_ERROR");
  }
} catch (error) {
  threw = true;
  assert.equal(error instanceof Error ? error.message : String(error), "model rejected multimodal request");
}
assert.equal(threw, true);

const channel = new AgentUIChannel();
threw = false;
try {
  await channel.consumeRun({ stream: okThenError() });
} catch (error) {
  threw = true;
  assert.equal(error instanceof Error ? error.message : String(error), "model rejected multimodal request");
}
assert.equal(threw, true);

async function* onlyRunError() {
  yield { type: "RUN_ERROR", message: "quota exceeded" };
}

threw = false;
try {
  for await (const chunk of runStreamWithReactiveCompactRetry({
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

console.log("stream-errors validation passed");
