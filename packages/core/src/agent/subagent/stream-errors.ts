/**
 * Shared helpers for TanStack agent stream error chunks.
 */

import type { StreamChunk } from "@tanstack/ai";

/** Extract a human-readable message from an AG-UI RUN_ERROR chunk. */
export function extractRunErrorMessage(chunk: StreamChunk): string {
  if (chunk.type !== "RUN_ERROR") return "";
  const record = chunk as { message?: string; error?: { message?: string } | Error | string };
  if (typeof record.error === "string") return record.error;
  if (record.error instanceof Error) return record.error.message;
  return record.message ?? record.error?.message ?? "Unknown error";
}

/** Fail fast when the model run emits RUN_ERROR instead of completing silently. */
export async function* throwOnRunError(stream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) {
    if (chunk.type === "RUN_ERROR") {
      const message = extractRunErrorMessage(chunk);
      throw new Error(message || "Agent run failed");
    }
    yield chunk;
  }
}
