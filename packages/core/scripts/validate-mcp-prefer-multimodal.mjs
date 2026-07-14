/**
 * Validates MCP multimodal content preference (structuredContent vs content[] images).
 *
 * Run: pnpm --filter @my-agent/core run validate:mcp-prefer-multimodal
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { mcpContentHasMultimodal, mcpContentToTanstack, resolveMcpToolExecuteResult } from "../dist/dev.mjs";

assert.equal(mcpContentHasMultimodal([{ type: "text", text: "hi" }]), false);
assert.equal(
  mcpContentHasMultimodal([
    { type: "image", data: "abc", mimeType: "image/jpeg" },
    { type: "text", text: "cap" },
  ]),
  true
);

const textOnly = mcpContentToTanstack([{ type: "text", text: "hello" }]);
assert.equal(textOnly, "hello");

const withImage = mcpContentToTanstack([
  { type: "image", data: "base64data", mimeType: "image/jpeg" },
  { type: "text", text: "Screenshot captured: 1024x640, 77KB" },
]);
assert.ok(Array.isArray(withImage));
assert.equal(withImage[0].type, "image");
assert.equal(withImage[0].source.value, "base64data");
assert.equal(withImage[1].type, "text");

// Prefer content[] when multimodal is present, even if structuredContent exists.
const multimodalResult = resolveMcpToolExecuteResult("screenshot", {
  structuredContent: { width: 1024, height: 640, sizeKB: 77 },
  content: [
    { type: "image", data: "img", mimeType: "image/jpeg" },
    { type: "text", text: "Screenshot captured: 1024x640, 77KB" },
  ],
});
assert.ok(Array.isArray(multimodalResult));
assert.equal(multimodalResult[0].type, "image");

// Text-only tools still prefer structuredContent.
const structuredResult = resolveMcpToolExecuteResult("meta_tool", {
  structuredContent: { ok: true, count: 2 },
  content: [{ type: "text", text: "ok" }],
});
assert.deepEqual(structuredResult, { ok: true, count: 2 });

// No structuredContent → content path.
const contentOnly = resolveMcpToolExecuteResult("plain", {
  content: [{ type: "text", text: "done" }],
});
assert.equal(contentOnly, "done");

let threw = false;
try {
  resolveMcpToolExecuteResult("bad", {
    isError: true,
    content: [{ type: "text", text: "boom" }],
  });
} catch (error) {
  threw = true;
  assert.ok(error instanceof Error);
  assert.match(error.message, /boom/);
}
assert.equal(threw, true);

console.log("mcp-prefer-multimodal validation passed");
