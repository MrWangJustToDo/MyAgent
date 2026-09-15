import type { UIMessage } from "@tanstack/ai";

export type CachedFlatMessage = {
  signature: string;
  flat: UIMessage[];
};

/**
 * Non-reactive flatten cache (must not write createState during render).
 *
 * NOTE: the cap must stay >= the static input window (see `getMessages`'s `window`
 * option). A working set larger than the cap makes the FIFO evict entries it is about
 * to need again, so every render misses and re-flattens the whole list — measured at
 * 793 entries against this 150-entry cap with 0 hits. The windowed path keeps the
 * working set well under the cap, and `getFlatByRef` below short-circuits the lookup
 * entirely while message identity holds.
 */
const MAX_FLAT_MESSAGE_ENTRIES = 150;
const cache = new Map<string, CachedFlatMessage>();
/** Insertion-order queue of cache keys — first-arrived entries are evicted first. */
const order: string[] = [];

export function getFlatMessage(key: string): CachedFlatMessage | undefined {
  return cache.get(key);
}

export function setFlatMessage(key: string, value: CachedFlatMessage): void {
  // FIFO by first arrival: only newly seen keys join the queue, so eviction
  // always removes the oldest-inserted entry (Map iteration order is fine, but
  // an explicit queue keeps the policy obvious and access-independent).
  const isNew = !cache.has(key);
  cache.set(key, value);
  if (isNew) order.push(key);
  while (order.length > MAX_FLAT_MESSAGE_ENTRIES) {
    const oldest = order.shift();
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearFlatMessageCache(): void {
  cache.clear();
  order.length = 0;
  staticSnapshots.clear();
  // Reassign rather than clear: a WeakMap has no clear(), and a session reset must not
  // let a later replay reuse rows derived from a previous session's message objects.
  flatByRef = new WeakMap();
}

// ============================================================================
// Reference-keyed flatten memo (P0-1)
// ============================================================================

/**
 * Flattened rows keyed by the message *object*.
 *
 * `flattenMessage` is a pure function of the message, so object identity is a sound
 * cache key — and strictly stronger than the content digest it replaces: a rebuilt
 * message is always a new object, so a stale hit is impossible. Stream processing
 * updates messages immutably, which is what makes identity stable across ticks.
 */
let flatByRef: WeakMap<UIMessage, UIMessage[]> = new WeakMap();

export function getFlatByRef(message: UIMessage): UIMessage[] | undefined {
  return flatByRef.get(message);
}

export function setFlatByRef(message: UIMessage, rows: UIMessage[]): void {
  flatByRef.set(message, rows);
}

/**
 * Per-(namespace, mode) snapshot of the static portion's flatten result.
 *
 * The flatten loop runs on every render, but its inputs (`projectTranscriptForDisplay`
 * output) keep object identity between ticks. Snapshotting the per-message grouping lets
 * an unchanged frame return the previous arrays by identity instead of re-deriving a
 * digest for every message.
 *
 * `namespace` keeps callers from evicting each other. It is the AGENT id: the main
 * transcript uses the root session id and each subagent preview uses its own, so a
 * subagent panel can neither thrash the transcript's snapshot nor another panel's.
 *
 * Reuse is gated on message IDENTITY (`srcRefs[i] === projectedStatic[i]`), never on id
 * equality, so a stale entry left by a destroyed agent can only cost one recompute — it
 * cannot produce a wrong frame. Cleanup via {@link clearStaticFlattenNamespace} is
 * therefore about memory (a subagent preview keeps the FULL transcript, as it passes no
 * `window`), not correctness.
 */
export type StaticFlattenSnapshot = {
  /** Static-source messages these rows were derived from (identity-comparable). */
  srcRefs: UIMessage[];
  /** Rows contributed by each source message, index-aligned with `srcRefs`. */
  perMessage: UIMessage[][];
  /** `perMessage` flattened and filtered through the caller's row predicate. */
  validRows: UIMessage[];
};

/**
 * Upper bound on retained snapshots, across all namespaces. Two slots are actually in use at
 * once — the main transcript's mode and the one open subagent preview's — so this is 2x
 * headroom, which absorbs entries left by a namespace whose cleanup has not run yet (a
 * preview switched away from, before its agent is destroyed).
 *
 * Kept deliberately small: with per-agent namespaces the count of LIVE namespaces is 2, so a
 * larger cap buys nothing and would only let dead agents' snapshots pile up. A snapshot holds
 * one row array per static-source message, so the cap is the memory bound — a 1300-message
 * transcript retains ~1 MB of row text per slot (measured), all of it reachable through the
 * map, unlike the rows themselves.
 */
const MAX_STATIC_SNAPSHOTS = 4;
const staticSnapshots = new Map<string, StaticFlattenSnapshot>();

const snapshotKey = (namespace: string, mode: string): string => `${namespace}|${mode}`;

const namespacePrefix = (namespace: string): string => `${namespace}|`;

/**
 * Flatten-snapshot namespace prefix for agent transcripts. Keyed by the agent id so the
 * main transcript and each subagent preview keep separate snapshots instead of evicting
 * one another.
 */
export const FLATTEN_NAMESPACE_PREFIX = "agent";

/** Namespace holding one agent's transcript snapshots (one entry per display mode). */
export const flattenNamespaceFor = (agentId: string): string => `${FLATTEN_NAMESPACE_PREFIX}:${agentId}`;

export function getStaticFlattenSnapshot(namespace: string, mode: string): StaticFlattenSnapshot | undefined {
  return staticSnapshots.get(snapshotKey(namespace, mode));
}

export function setStaticFlattenSnapshot(namespace: string, mode: string, snapshot: StaticFlattenSnapshot): void {
  const key = snapshotKey(namespace, mode);
  // Re-insert so the most recently used namespace is evicted last.
  staticSnapshots.delete(key);
  staticSnapshots.set(key, snapshot);
  while (staticSnapshots.size > MAX_STATIC_SNAPSHOTS) {
    const oldest = staticSnapshots.keys().next().value;
    if (oldest === undefined) break;
    staticSnapshots.delete(oldest);
  }
}

/**
 * Drop every snapshot belonging to one agent (all modes). Call with an AGENT ID — the
 * namespace is derived internally, so callers never hand-build the prefixed key. Used when
 * an agent is destroyed, so a preview's full-transcript snapshot is not retained until LRU
 * eviction.
 */
export function clearStaticFlattenNamespace(agentId: string): void {
  // The prefix ends in the key separator, so "agent:a" can never match "agent:ab|full".
  const prefix = namespacePrefix(flattenNamespaceFor(agentId));
  for (const key of [...staticSnapshots.keys()]) {
    if (key.startsWith(prefix)) staticSnapshots.delete(key);
  }
}
