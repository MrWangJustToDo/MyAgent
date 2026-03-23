/**
 * Token Estimator - Estimate token counts for messages.
 *
 * Uses character-based approximation (characters / 4) for simplicity.
 * This is sufficient for threshold detection without requiring model-specific tokenizers.
 *
 * Uses Vercel AI SDK's ModelMessage type directly.
 */

import type { ModelMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

/**
 * Approximate characters per token.
 * Based on typical tokenizer behavior (GPT-4, Claude, etc.)
 */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get string length of a value, handling various types.
 */
function getStringLength(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "string") {
    return value.length;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).length;
  }

  // For objects and arrays, stringify
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Estimate characters in a content part.
 * Handles various part types from AI SDK.
 */
function estimatePartChars(part: unknown): number {
  if (!part || typeof part !== "object") {
    return getStringLength(part);
  }

  const p = part as Record<string, unknown>;
  const type = p.type as string | undefined;

  switch (type) {
    case "text":
      return getStringLength(p.text);

    case "reasoning":
      return getStringLength(p.text);

    case "tool-call":
      // Tool name + args
      return getStringLength(p.toolName) + getStringLength(p.args);

    case "tool-result":
      // Tool name + result
      return getStringLength(p.toolName) + getStringLength(p.result);

    case "image":
      // Image data is typically base64, count the URL/data length
      return getStringLength(p.image) + 50;

    case "file":
      return getStringLength(p.data) + getStringLength(p.mimeType) + 50;

    case "tool-approval-request":
    case "tool-approval-response":
      return getStringLength(p.toolName) + getStringLength(p.args) + 50;

    default:
      // For unknown types, stringify the whole part
      return getStringLength(part);
  }
}

/**
 * Estimate characters for message content.
 */
function estimateContentChars(content: ModelMessage["content"]): number {
  if (typeof content === "string") {
    return content.length;
  }

  if (Array.isArray(content)) {
    let total = 0;
    for (const part of content) {
      total += estimatePartChars(part);
    }
    return total;
  }

  return getStringLength(content);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Estimate token count for a single message.
 *
 * @param message - The message to estimate (Vercel AI SDK ModelMessage)
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateMessageTokens({
 *   role: "user",
 *   content: "Hello, world!"
 * });
 * // Returns ~4 tokens (13 chars / 4)
 * ```
 */
export function estimateMessageTokens(message: ModelMessage): number {
  let chars = 0;

  // Role overhead (system/user/assistant/tool)
  chars += message.role.length + 10; // Add some overhead for role markers

  // Content
  chars += estimateContentChars(message.content);

  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Estimate total token count for an array of messages.
 *
 * @param messages - Array of messages to estimate (Vercel AI SDK ModelMessage[])
 * @returns Total estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens([
 *   { role: "system", content: "You are a helpful assistant." },
 *   { role: "user", content: "Hello!" },
 *   { role: "assistant", content: "Hi there! How can I help?" },
 * ]);
 * // Returns estimated total tokens
 * ```
 */
export function estimateTokens(messages: ModelMessage[]): number {
  if (!messages || messages.length === 0) {
    return 0;
  }

  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message);
  }

  // Add overhead for message separators and structure
  total += messages.length * 3;

  return total;
}
