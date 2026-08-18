/**
 * Guard against TanStack interrupt snapshots replacing the durable UI channel.
 *
 * `MESSAGES_SNAPSHOT` is built from engine `this.messages` (often a summary-first
 * wire projection). StreamProcessor would overwrite the chronological channel.
 * Incremental TEXT/TOOL chunks plus channel `addToolResult` /
 * `addToolApprovalResponse` already keep the channel current — skip every snapshot.
 */

import type { StreamChunk } from "@tanstack/ai";

/** Whether this chunk is a `MESSAGES_SNAPSHOT` that must not replace the channel. */
export function shouldSuppressMessagesSnapshot(chunk: StreamChunk): boolean {
  return chunk.type === "MESSAGES_SNAPSHOT";
}
