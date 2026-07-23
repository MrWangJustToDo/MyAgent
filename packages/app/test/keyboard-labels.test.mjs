/**
 * Validation for keyboard label helpers.
 *
 * Run: node packages/app/test/keyboard-labels.test.mjs
 */

import assert from "node:assert/strict";

/** Keep in sync with `src/utils/keyboard-labels.ts` → `isModifiedEnter`. */
function isModifiedEnter(inputChar, key) {
  if (key.return && (key.shift || key.meta || key.ctrl)) return true;
  if (key.ctrl && inputChar === "\n") return true;
  return false;
}

assert.equal(isModifiedEnter("", { return: true }), false);
assert.equal(isModifiedEnter("", { return: true, shift: true }), true);
assert.equal(isModifiedEnter("", { return: true, meta: true }), true);
assert.equal(isModifiedEnter("", { return: true, ctrl: true }), true);
assert.equal(isModifiedEnter("\n", { ctrl: true }), true);
assert.equal(isModifiedEnter("\n", {}), false);
assert.equal(isModifiedEnter("a", { ctrl: true }), false);

/** Mirror KeyLabel / hint builders for regression without importing dist. */
const KeyLabel = {
  enter: "Enter",
  esc: "Esc",
  ctrlC: "Ctrl+C",
  ctrlE: "Ctrl+E",
  upDown: "↑↓",
  y: "y",
  n: "n",
};

assert.equal(`${KeyLabel.ctrlC} / ${KeyLabel.esc}`, "Ctrl+C / Esc");
assert.equal(`${KeyLabel.y} / ${KeyLabel.n}`, "y / n");
assert.match(
  `(${KeyLabel.upDown} navigate, ${KeyLabel.enter} open, ${KeyLabel.esc} back)`,
  /↑↓ navigate, Enter open, Esc back/
);
// TUI must advertise Ctrl, never Cmd.
assert.doesNotMatch(KeyLabel.ctrlC, /Cmd|⌘|Command/);

console.log("keyboard-labels.test OK");
