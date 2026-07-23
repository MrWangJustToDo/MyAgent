/**
 * Validation for PendingMessageQueue drain modes.
 *
 * Run: pnpm --filter @my-agent/core run validate:pending-message-queue
 */

import assert from "node:assert/strict";

import { PendingMessageQueue } from "../dist/dev.mjs";

const oneAtATime = new PendingMessageQueue("one-at-a-time");
oneAtATime.enqueue("a");
oneAtATime.enqueue("b");
oneAtATime.enqueue("c");
assert.equal(oneAtATime.size(), 3);
assert.deepEqual(oneAtATime.drain(), ["a"]);
assert.deepEqual(oneAtATime.drain(), ["b"]);
assert.deepEqual(oneAtATime.peekAll(), ["c"]);
assert.deepEqual(oneAtATime.clear(), ["c"]);
assert.equal(oneAtATime.hasItems(), false);

const allMode = new PendingMessageQueue("all");
allMode.enqueue(1);
allMode.enqueue(2);
assert.deepEqual(allMode.drain(), [1, 2]);
assert.equal(allMode.hasItems(), false);
assert.deepEqual(allMode.drain(), []);

const switchMode = new PendingMessageQueue("one-at-a-time");
switchMode.enqueue("x");
switchMode.enqueue("y");
switchMode.mode = "all";
assert.deepEqual(switchMode.drain(), ["x", "y"]);

console.log("validate:pending-message-queue OK");
