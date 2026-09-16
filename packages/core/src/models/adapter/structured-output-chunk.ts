import type { StreamChunk, StructuredOutputCompleteEvent } from "@tanstack/ai";

/**
 * The terminal event of a `chat({ outputSchema, stream: true })` run, narrowed
 * out of the general chunk union.
 *
 * The structured object does not travel as a typed message part — it arrives as
 * a `CUSTOM` chunk named `structured-output.complete`, whose `value` carries the
 * already-normalized object plus the raw text. Reading it needs this narrow,
 * because `chunk.value` is not on the general `StreamChunk` union.
 *
 * The plain `CustomEvent` member is included because a tool can emit arbitrary
 * user-defined custom events (`emitCustomEvent`), which flow through this stream
 * at runtime but are deliberately absent from `StructuredOutputStream`'s type.
 */
export type StructuredOutputCompleteChunk = StructuredOutputCompleteEvent & { type: "CUSTOM" };

export function isStructuredOutputComplete(
  chunk: StreamChunk | StructuredOutputCompleteEvent | { type: "CUSTOM"; name: string; value: unknown }
): chunk is StructuredOutputCompleteChunk {
  return chunk.type === "CUSTOM" && chunk.name === "structured-output.complete";
}
