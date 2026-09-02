/**
 * Shared synthetic-message injection used by context middleware (turn-context)
 * and background-notification. One code path for: channel persistence (dedup by
 * stable content-hash id) + wire-message injection (appended to the tail so the
 * wire payload stays byte-identical to the next channel projection — prefix-cache
 * stability).
 *
 * Channel writes delegate to {@link appendChannelMessages} (agent/channel-write.ts)
 * — the single safe channel-append entry shared with compaction. This module only
 * adds the wire-side mirror + stable content-hash id derivation.
 */

import { appendChannelMessages } from "../../agent/channel-write.js";
import { hashTurnContextPayload } from "../../agent/turn-context/turn-context-message.js";

import type { AgentUIChannel } from "../../agent/ui-channel.js";
import type { ModelMessage, UIMessage } from "@tanstack/ai";

export interface SyntheticMessageEntry {
  /** Stable category key (also encoded in the message id for readability). */
  kind: string;
  /** Fully rendered message content (including the `<ctx kind=...>` shell). */
  content: string;
  /** Optional admission episode. When set, the id becomes `ctx-<kind>-<hash>-<nonce>`
   *  so recurring / cyclic state (mode re-entry, nag reminders) re-injects even
   *  when the content is byte-identical to a historical message. */
  nonce?: number;
}

export interface SyntheticInjectionDeps {
  ui: AgentUIChannel;
  /** Persist the updated UI messages (no-op for subagents without a session store). */
  persist: (next: UIMessage[]) => void;
}

/** Stable id for a synthetic context message (content-hash dedupe across restores). */
export function syntheticMessageId(entry: SyntheticMessageEntry): string {
  const hash = hashTurnContextPayload(entry.content);
  return entry.nonce === undefined ? `ctx-${entry.kind}-${hash}` : `ctx-${entry.kind}-${hash}-${entry.nonce}`;
}

/**
 * Inject synthetic user messages into the wire payload AND the UI channel.
 *
 * Entries whose stable id already exists in the channel are skipped (dedupe),
 * so re-running onConfig mid-loop or across restores never duplicates. Returns
 * the contents that were actually injected (empty when nothing changed).
 *
 * Both channel and wire APPEND to the end. Appending keeps per-turn injection
 * order = time order (so later re-injections never jump ahead of earlier ones)
 * and only grows the message tail — preserving the prompt-cache prefix.
 */
export function injectSyntheticMessages(
  messages: ModelMessage[],
  entries: SyntheticMessageEntry[],
  deps: SyntheticInjectionDeps
): string[] {
  if (entries.length === 0) return [];

  const existingIds = new Set(deps.ui.getMessages().map((message) => message.id));
  const fresh = entries.filter((entry) => !existingIds.has(syntheticMessageId(entry)));
  if (fresh.length === 0) return [];

  // --- Channel: append (time order) via the shared safe entry, then persist. ---
  const inserted: UIMessage[] = fresh.map((entry) => ({
    id: syntheticMessageId(entry),
    role: "user",
    parts: [{ type: "text", content: entry.content }],
  }));
  appendChannelMessages(deps.ui, inserted, { existingIds, persist: deps.persist });

  // --- Wire: append at the tail so this call's payload matches what the next
  // channel projection produces (cross-turn prefix stability). ---
  messages.push(...fresh.map((entry) => ({ role: "user" as const, content: entry.content })));

  return fresh.map((entry) => entry.content);
}
