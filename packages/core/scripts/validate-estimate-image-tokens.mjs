/**
 * Validation for vision token estimates + PNG dimension parsing.
 *
 * Run: pnpm --filter @my-agent/core run validate:estimate-image-tokens
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { estimateImageInputTokens, estimateImageTokensFromDimensions, tryReadImageDimensions } from "../dist/dev.mjs";

assert.equal(estimateImageTokensFromDimensions(512, 512), 85 + 170);
assert.equal(estimateImageTokensFromDimensions(1024, 1024), 85 + 4 * 170);
assert.ok(estimateImageInputTokens(40_000) < estimateImageInputTokens(600_000));

// Minimal 1x1 PNG
const png1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);
assert.deepEqual(tryReadImageDimensions(png1x1), { width: 1, height: 1 });
assert.equal(estimateImageInputTokens(png1x1.length, tryReadImageDimensions(png1x1)), 85 + 170);

console.log("estimate-image-tokens validation passed");
