/**
 * Validates read_file multimodal model output formatting.
 *
 * Run: node packages/core/scripts/validate-format-read-file-result.mjs
 */

import assert from "node:assert/strict";

import { formatReadFileToolResult } from "../dist/dev.mjs";

const textOutput = formatReadFileToolResult({
  type: "text",
  path: "src/index.ts",
  content: "1: export {}",
  modifiedTime: "abc",
  totalLines: 1,
  startLine: 1,
  endLine: 1,
  truncated: false,
  durationMs: 1,
  cachedOutputPath: null,
});
assert.equal(textOutput.type, "text");

const imageOutput = formatReadFileToolResult({
  type: "image",
  path: "img.png",
  mimeType: "image/png",
  base64: "aGVsbG8=",
  size: 5,
  durationMs: 2,
  cachedOutputPath: null,
});
assert.ok(Array.isArray(imageOutput));
assert.equal(imageOutput.length, 2);
assert.equal(imageOutput[0].type, "text");
assert.equal(imageOutput[1].type, "image");
assert.equal(imageOutput[1].source.type, "data");
assert.equal(imageOutput[1].source.mimeType, "image/png");

const pdfOutput = formatReadFileToolResult({
  type: "pdf",
  path: "doc.pdf",
  base64: "JVBERi0=",
  size: 8,
  durationMs: 3,
  cachedOutputPath: null,
});
assert.ok(Array.isArray(pdfOutput));
assert.equal(pdfOutput[1].type, "document");
assert.equal(pdfOutput[1].source.mimeType, "application/pdf");

console.log("format-read-file-result validation passed");
