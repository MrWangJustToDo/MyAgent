## Context

Compaction/chat middleware re-projects the entire UI channel to wire messages on each `onConfig`, which is O(history × tool-rounds) CPU even when only the last assistant message changed. The UI channel is the durable SoT (`unified-message-chain`); `messages` transport stays full `UIMessage[]`.

## Goals / Non-Goals

**Goals:**

- Cache last wire projection keyed by a cheap fingerprint (channel revision + last message id/len + policy key).
- Reuse the same `ModelMessage[]` reference when the fingerprint is unchanged.
- Invalidate on structural resets (clear / restore / compact).

**Non-Goals:**

- Changing the Session `messages` transport (still full arrays; JSON-patch / delta delivery is explicitly deferred).
- Changing persistence format (still full dehydrated `uiMessages`).
- Redesigning tool streaming channel (`tool` / summary streams stay as-is).
- Token-estimator or memory-side-LLM work (separate changes).

## Decisions

1. **Fingerprint** — Combine `AgentUIChannel.getRevision()` (monotonic counter bumped on every messages change), message count, last-message id + content length, and `policyKeyFromOptions(...)` (keep-policy config). No full JSON.stringify.
2. **Cache scope** — One `WireProjectionCache` per middleware instance (per agent). `getOrCompute(fingerprint, compute)` returns the cached array reference on hit.
3. **Invalidation** — Compaction that appends a summary / cuts history calls `invalidate()`. Revision bump naturally covers append/replace/remove from the channel.
4. **Immutability invariant** — StreamProcessor updates messages immutably (replace, not mutate in place), so the cached array reference stays valid until the fingerprint changes.

## Risks / Trade-offs

- [Fingerprint misses a silent mutation] → Channel messages are treated as immutable; revision bumps on every `handleMessagesChange`, so any real change invalidates.
- [Stale wire after compaction] → Explicit `invalidate()` before re-projection after a compact result.
- [Fingerprint cost] → Revision + count + last id/len is O(1) amortized; no stringification.

## Migration Plan

1. Add `revision` to `AgentUIChannel` (+1 in `handleMessagesChange`).
2. Add `WireProjectionCache` + `wireSourceFingerprint` in `agent/compaction/`.
3. Wire into `createCompactionMiddleware` `onConfig`; invalidate on compact.
4. Add `validate:wire-projection-cache`; update `ARCHITECTURE.md`.

Rollback: remove the cache call — middleware still returns a freshly projected array.

## Open Questions

- None blocking. (Session `messages` delta remains a future change if a transport/perf need emerges.)
