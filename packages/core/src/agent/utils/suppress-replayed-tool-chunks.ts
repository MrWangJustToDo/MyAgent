/**
 * Detect TanStack continuation chunks that would duplicate an existing tool-call
 * onto a new assistant message (approval → second chat() → argsMap START replay).
 */

import type { StreamChunk, UIMessage } from "@tanstack/ai";

/** Chunk types that recreate a tool-call part when StreamProcessor has no active message. */
const REPLAY_TOOL_CHUNK_TYPES = new Set(["TOOL_CALL_START", "TOOL_CALL_ARGS"]);

export function findToolCallPart(
  messages: UIMessage[],
  toolCallId: string
): Extract<UIMessage["parts"][number], { type: "tool-call" }> | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call" && part.id === toolCallId) {
        return part;
      }
    }
  }
  return undefined;
}

function readToolCallId(chunk: StreamChunk): string | undefined {
  if (!("toolCallId" in chunk)) return undefined;
  const id = (chunk as { toolCallId?: unknown }).toolCallId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Whether this chunk is a continuation replay of a tool call already present in UI.
 * START/ARGS must be dropped; END/RESULT should still flow so the existing part updates.
 */
export function shouldSuppressReplayedToolChunk(messages: UIMessage[], chunk: StreamChunk): boolean {
  if (!REPLAY_TOOL_CHUNK_TYPES.has(chunk.type)) return false;
  const toolCallId = readToolCallId(chunk);
  if (!toolCallId) return false;
  return findToolCallPart(messages, toolCallId) !== undefined;
}
