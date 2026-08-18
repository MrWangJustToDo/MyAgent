/**
 * Guard against TanStack interrupt snapshots leaking the summary-first wire
 * projection back into the durable (chronological) UI channel.
 *
 * After compaction the compaction middleware returns a summary-first wire
 * projection (`[SUMMARY, …kept, …after]`) to TanStack, which stores it on the
 * engine (`this.messages = config.messages`). If an interrupt fires later in the
 * same run (tool approval / client tool), TanStack emits a `MESSAGES_SNAPSHOT`
 * built from that projected engine state. StreamProcessor then overwrites the
 * entire UI channel with it — collapsing pre-compact history into the summary
 * and moving the summary from the chronological tail to index 0.
 *
 * A summary can only appear at index 0 when the snapshot carries the projected
 * wire order; the durable channel keeps the latest summary at its tail. Skip
 * such snapshots so the chronological channel (compact append + normal stream
 * chunks) remains the source of truth.
 */

import { isCompactionSummaryText } from "../compaction/compaction-summary.js";

import type { StreamChunk } from "@tanstack/ai";

/**
 * Whether a `MESSAGES_SNAPSHOT` chunk carries the summary-first wire projection
 * (first message is a compaction summary) and must not overwrite the channel.
 */
export function shouldSuppressSummaryFirstSnapshot(chunk: StreamChunk): boolean {
  if (chunk.type !== "MESSAGES_SNAPSHOT") return false;

  const first = chunk.messages[0];
  if (!first || first.role !== "user") return false;
  if (typeof first.content !== "string") return false;

  return isCompactionSummaryText(first.content);
}
