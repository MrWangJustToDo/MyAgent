/**
 * Validates memory prefetch helpers and selected-filename resolution.
 *
 * Run: pnpm --filter @my-agent/core run validate:memory-service
 */

import assert from "node:assert/strict";

import { extractTextFromContent, resolveSelectedMemoryFilename } from "../dist/dev.mjs";

assert.equal(extractTextFromContent("plain string"), "plain string");

assert.equal(
  extractTextFromContent([{ type: "text", content: "hello from parts" }]),
  "hello from parts",
  "TanStack text parts use `content`, not legacy `text`"
);

assert.equal(
  extractTextFromContent([
    { type: "text", content: "line one" },
    { type: "text", content: "line two" },
  ]),
  "line one\nline two"
);

const samples = [
  {
    filename: "user-preferences.md",
    name: "user-preferences",
    type: "user",
    description: "Prefs",
    body: "prefers concise replies",
  },
  {
    filename: "deepseek-pricing-and-cost.md",
    name: "deepseek-pricing-and-cost",
    type: "project",
    description: "Cost notes",
    body: "pricing",
  },
];
const map = new Map(samples.map((m) => [m.filename, m]));

assert.equal(resolveSelectedMemoryFilename("user-preferences.md", map, samples)?.filename, "user-preferences.md");
assert.equal(resolveSelectedMemoryFilename("user-preferences", map, samples)?.filename, "user-preferences.md");
assert.equal(
  resolveSelectedMemoryFilename("deepseek-pricing-and-cost", map, samples)?.filename,
  "deepseek-pricing-and-cost.md"
);
assert.equal(resolveSelectedMemoryFilename("missing-thing", map, samples), undefined);

console.log("memory-service validation passed");
