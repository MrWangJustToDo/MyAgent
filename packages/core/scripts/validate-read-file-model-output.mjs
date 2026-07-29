/**
 * Validation for read_file / webfetch model shaping (multimodal tool results).
 *
 * Run: pnpm --filter @my-agent/core run validate:read-file-model-output
 */

import assert from "node:assert/strict";

import { formatReadFileToolResult, liftToolMediaForChatCompletions } from "../dist/dev.mjs";

const imageOut = formatReadFileToolResult({
  type: "image",
  path: "a.png",
  mimeType: "image/png",
  base64: "abc",
  size: 12,
  durationMs: 1,
});
assert.ok(Array.isArray(imageOut));
assert.equal(imageOut[1].type, "image");

const pdfOut = formatReadFileToolResult({
  type: "pdf",
  path: "a.pdf",
  base64: "pdfb64",
  size: 1000,
  extractedText: "Chapter 1: Hello",
  pageCount: 2,
  durationMs: 1,
});
assert.ok(Array.isArray(pdfOut));
assert.match(pdfOut[0].content, /Chapter 1: Hello/);
assert.equal(pdfOut[1].type, "document");

// Completions lift keeps extract text, drops document binary
const lifted = liftToolMediaForChatCompletions([{ role: "tool", toolCallId: "1", content: pdfOut }]);
assert.equal(lifted.length, 1);
assert.match(String(lifted[0].content), /Chapter 1: Hello/);
assert.ok(!String(lifted[0].content).includes("pdfb64"));

console.log("read-file-model-output validation passed");
