/**
 * The single channel → model-wire projection.
 *
 * Both the compaction middleware (once per model call) and
 * `ManagedAgent.getMessagesForLLM` (manual `/compact`, reactive compact, memory
 * extraction, run-outcome previews) project through here. They must never fork: if the
 * window a reader sees disagrees with the one the model receives, compaction would
 * summarize a different slice than the wire carries, and nothing in the type system
 * would catch it.
 *
 * The result is cached by channel revision + keep-policy key. `WireProjectionCache`
 * hands back the **same array reference** on a hit, which is what makes it affordable
 * on the per-iteration path — and also why writers downstream must return replacements
 * instead of editing the array they are handed.
 */

import { convertMessagesToModelMessages } from "@tanstack/ai";

import {
  getModelVisibleMessages,
  keepPolicyProjectionOptions,
  policyKeyFromOptions,
  resolveKeepPolicy,
  wireSourceFingerprint,
} from "../../agent/compaction";

import type { CompactionConfig } from "../../agent/compaction/types.js";
import type { WireProjectionCache } from "../../agent/compaction/wire-projection-cache.js";
import type { ModelMessage } from "@tanstack/ai";

/** Only the channel surface the projection reads — keeps stubs easy to construct. */
export interface WireProjectionSource {
  getMessages(): Parameters<typeof convertMessagesToModelMessages>[0];
  /** Monotonic revision bumped on every channel messages change (cache key). */
  getRevision(): number;
}

export function projectWireFromChannel(
  channel: WireProjectionSource,
  config: CompactionConfig | null,
  contextWindow: number | undefined,
  cache: WireProjectionCache
): ModelMessage[] {
  const policyOptions = keepPolicyProjectionOptions(resolveKeepPolicy(config ?? {}, contextWindow));
  const messages = channel.getMessages();
  const fingerprint = wireSourceFingerprint(channel.getRevision(), messages, policyKeyFromOptions(policyOptions));
  return cache.getOrCompute(fingerprint, () =>
    getModelVisibleMessages(convertMessagesToModelMessages(messages), policyOptions)
  );
}
