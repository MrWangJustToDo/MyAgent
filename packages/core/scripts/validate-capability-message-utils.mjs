/**
 * Validates capability-gated multimodal message sanitization.
 *
 * Run: pnpm --filter @my-agent/core run validate:capability-message-utils
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  MULTIMODAL_OMITTED_PLACEHOLDER,
  chatMessagesHaveImages,
  chatMessagesHaveMultimodal,
  isMultimodalUnsupportedError,
  isVisionUnsupportedError,
  sanitizeMessagesForCapabilities,
  stripMultimodalFromChatMessages,
  trySanitizeForMultimodalRetry,
  unsupportedMultimodalPartTypes,
} from "../dist/dev.mjs";

assert.equal(
  isMultimodalUnsupportedError(
    new Error(
      "400 Failed to deserialize the JSON body into the target type: messages[1]: unknown variant `image_url`, expected `text`"
    )
  ),
  true
);
assert.equal(isMultimodalUnsupportedError(new Error("unsupported content part type for adapter: audio")), true);
assert.equal(isMultimodalUnsupportedError(new Error("network timeout")), false);
assert.equal(isVisionUnsupportedError(new Error("unknown variant `image_url`, expected `text`")), true);

const withMedia = [
  {
    id: "u1",
    role: "user",
    parts: [
      { type: "text", content: "see this?" },
      {
        type: "image",
        source: { type: "url", value: "data:image/png;base64,abc" },
      },
      {
        type: "document",
        source: { type: "data", value: "JVBERi0x", mimeType: "application/pdf" },
      },
    ],
  },
];

assert.equal(chatMessagesHaveImages(withMedia), true);
assert.equal(chatMessagesHaveMultimodal(withMedia), true);

const textOnly = {
  hasCapability: (cap) => !["vision", "audio", "video", "document"].includes(cap),
};
assert.deepEqual([...unsupportedMultimodalPartTypes(textOnly)].sort(), ["audio", "document", "image", "video"]);

const sanitized = sanitizeMessagesForCapabilities(withMedia, textOnly);
assert.equal(chatMessagesHaveMultimodal(sanitized), false);
assert.equal(
  sanitized[0].parts.some((p) => p.type === "text" && p.content === MULTIMODAL_OMITTED_PLACEHOLDER),
  true
);
assert.equal(
  sanitized[0].parts.some((p) => p.type === "text" && p.content === "see this?"),
  true
);
// Original UI message must stay intact.
assert.equal(chatMessagesHaveMultimodal(withMedia), true);

const visionOnly = {
  hasCapability: (cap) => cap === "vision" || cap === "streaming",
};
const keepImageDropDoc = sanitizeMessagesForCapabilities(withMedia, visionOnly);
assert.equal(chatMessagesHaveMultimodal(keepImageDropDoc, new Set(["image"])), true);
assert.equal(chatMessagesHaveMultimodal(keepImageDropDoc, new Set(["document"])), false);

const retry = trySanitizeForMultimodalRetry(new Error("unknown variant `image_url`, expected `text`"), withMedia);
assert.ok(retry);
assert.equal(chatMessagesHaveMultimodal(retry), false);

assert.equal(
  trySanitizeForMultimodalRetry(
    new Error("unknown variant `image_url`"),
    stripMultimodalFromChatMessages(withMedia, new Set(["image", "audio", "video", "document"]))
  ),
  null
);

// Optimistic probe (empty capabilities semantics via always-true) → no preemptive strip.
const optimistic = { hasCapability: () => true };
assert.equal(sanitizeMessagesForCapabilities(withMedia, optimistic), withMedia);

console.log("capability-message-utils validation passed");
