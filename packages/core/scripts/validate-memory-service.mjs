/**
 * Validates memory prefetch query extraction and extraction dialogue serialization.
 *
 * Run: pnpm --filter @my-agent/core run validate:memory-service
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { extractTextFromContent } from "../dist/dev.mjs";

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

console.log("memory-service validation passed");
