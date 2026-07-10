import assert from "node:assert/strict";
import test from "node:test";

import { createFeedbackQueue } from "../dist/utils/input-feedback-queue.mjs";

test("createFeedbackQueue shows items sequentially then clears", async () => {
  const shown = [];
  let cleared = 0;

  const queue = createFeedbackQueue({
    displayMs: 20,
    onShow: (item) => shown.push(item),
    onClear: () => {
      cleared += 1;
    },
  });

  queue.enqueue({ message: "first", level: "info" });
  queue.enqueue({ message: "second", level: "success" });

  assert.deepEqual(shown, [{ message: "first", level: "info" }]);

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(shown, [
    { message: "first", level: "info" },
    { message: "second", level: "success" },
  ]);

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(cleared, 1);
});

test("createFeedbackQueue clear drops pending items", async () => {
  const shown = [];

  const queue = createFeedbackQueue({
    displayMs: 50,
    onShow: (item) => shown.push(item),
    onClear: () => {},
  });

  queue.enqueue({ message: "first", level: "info" });
  queue.enqueue({ message: "second", level: "success" });
  queue.clear();
  queue.enqueue({ message: "after-clear", level: "info" });

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(shown, [
    { message: "first", level: "info" },
    { message: "after-clear", level: "info" },
  ]);
});
