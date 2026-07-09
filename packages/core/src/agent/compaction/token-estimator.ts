/**
 * Token Estimator - Estimate token counts for messages.
 *
 * Uses character-based approximation (characters / 4) for threshold detection.
 * Handles TanStack {@link ModelMessage} shape including `toolCalls` and tool messages.
 */

import { getToolMessageContentSize } from "./message-utils.js";

import type { ContentPart, ModelMessage } from "@tanstack/ai";

const CHARS_PER_TOKEN = 4;

function getStringLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "number" || typeof value === "boolean") return String(value).length;

  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

export function estimateContentPartChars(part: ContentPart): number {
  switch (part.type) {
    case "text":
      return part.content?.length ?? 0;
    case "image":
    case "audio":
    case "video":
    case "document":
      if (part.source.type === "data") {
        return part.source.value.length;
      }
      return 1000 * CHARS_PER_TOKEN;
    default:
      return getStringLength(part);
  }
}

function estimateContentChars(content: ModelMessage["content"]): number {
  if (typeof content === "string") return content.length;
  if (content === null) return 0;

  if (Array.isArray(content)) {
    let total = 0;
    for (const part of content) {
      total += estimateContentPartChars(part);
    }
    return total;
  }

  return getStringLength(content);
}

function estimateToolCallsChars(toolCalls: ModelMessage["toolCalls"]): number {
  if (!toolCalls || toolCalls.length === 0) return 0;

  let total = 0;
  for (const toolCall of toolCalls) {
    total += getStringLength(toolCall.function.name);
    total += getStringLength(toolCall.function.arguments);
    total += 20;
  }
  return total;
}

function estimateThinkingChars(thinking: ModelMessage["thinking"]): number {
  if (!thinking || thinking.length === 0) return 0;
  return thinking.reduce((sum, entry) => sum + getStringLength(entry.content), 0);
}

/**
 * Estimate token count for a single TanStack ModelMessage.
 */
export function estimateMessageTokens(message: ModelMessage): number {
  let chars = message.role.length + 10;

  if (message.role === "tool") {
    chars += getToolMessageContentSize(message.content);
    chars += getStringLength(message.toolCallId);
  } else {
    chars += estimateContentChars(message.content);
    if (message.role === "assistant") {
      chars += estimateToolCallsChars(message.toolCalls);
      chars += estimateThinkingChars(message.thinking);
    }
  }

  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Estimate total token count for an array of messages.
 */
export function estimateTokens(messages: ModelMessage[]): number {
  if (!messages || messages.length === 0) return 0;

  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message);
  }

  total += messages.length * 3;
  return total;
}
