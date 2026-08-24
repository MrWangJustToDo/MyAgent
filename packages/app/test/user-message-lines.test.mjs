import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { truncateTextToMaxLines, wrapTextToLines } = await import(new URL("../dist/index.mjs", import.meta.url).href);

test("wrapTextToLines hard-wraps long words and counts CJK as 2 columns", () => {
  const rows = wrapTextToLines("abcdefghij", 4);
  assert.deepEqual(rows, ["abcd", "efgh", "ij"]);

  const cjk = wrapTextToLines("中文中文", 4);
  assert.deepEqual(cjk, ["中文", "中文"]);
});

test("truncateTextToMaxLines keeps text within the row budget", () => {
  const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  const { text: capped, truncated, hiddenLines } = truncateTextToMaxLines(text, 40, 60);

  assert.equal(truncated, true);
  const rendered = wrapTextToLines(capped, 40);
  assert.ok(rendered.length <= 60, `expected <= 60 rows, got ${rendered.length}`);
  assert.equal(hiddenLines, 200 - 59);
  assert.match(rendered[rendered.length - 1] ?? "", /…/);
});

test("truncateTextToMaxLines returns original text when under budget", () => {
  const { text, truncated, hiddenLines } = truncateTextToMaxLines("short", 40, 60);
  assert.equal(text, "short");
  assert.equal(truncated, false);
  assert.equal(hiddenLines, 0);
});

test("truncateTextToMaxLines falls back to a bare ellipsis when the hint would wrap", () => {
  const { text } = truncateTextToMaxLines("x".repeat(500), 4, 3);
  const rows = wrapTextToLines(text, 4);
  assert.ok(rows.length <= 3, `expected <= 3 rows, got ${rows.length}`);
  assert.equal(rows[rows.length - 1], "…");
});

test("truncateTextToMaxLines shows the exact drop count when the hint fits the width", () => {
  const text = Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n");
  const { text: capped, hiddenLines } = truncateTextToMaxLines(text, 80, 60);

  assert.equal(hiddenLines, 21);
  assert.ok(capped.includes("(21 lines truncated)"), `missing count in last row: ${capped.split("\n").pop()}`);
});
