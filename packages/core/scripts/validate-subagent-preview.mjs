/**
 * Validates subagent preview store get/set/subscribe wiring.
 *
 * Run: pnpm --filter @my-agent/core run validate:subagent-preview
 */
/* eslint-disable no-undef, import/no-useless-path-segments */
import assert from "node:assert/strict";

import { subagentPreviewStore } from "../dist/index.mjs";

const subagentId = "subagent-test-1";
let notifyCount = 0;

const unsubscribe = subagentPreviewStore.subscribe(subagentId, () => {
  notifyCount++;
});

assert.equal(subagentPreviewStore.get(subagentId), undefined);

const messages = [
  {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  },
];

subagentPreviewStore.set(subagentId, messages);
assert.equal(notifyCount, 1);
assert.deepEqual(subagentPreviewStore.get(subagentId), messages);

subagentPreviewStore.clear(subagentId);
assert.equal(notifyCount, 2);
assert.equal(subagentPreviewStore.get(subagentId), undefined);

unsubscribe();

console.log("subagent-preview validation passed");
