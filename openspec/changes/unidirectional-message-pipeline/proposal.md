## Why

`unified-message-chain` already names the UI channel as the only durable UIMessage store, but TanStack `chat()` still treats engine `this.messages` as a mutable second copy. Compaction middleware writes a summary-first wire projection into that engine; interrupt `MESSAGES_SNAPSHOT` can overwrite the chronological channel (partially guarded by `shouldSuppressSummaryFirstSnapshot`). `buildCanonicalModelMessages` then trusts the engine as mid-run authority via `runBaselineCount`. The lag that justified that merge is gone: `early-tool-result-ui-middleware` patches the channel per tool, and `pumpToolPhases` re-reads the live channel between `chat()` calls. This change closes the remaining write-back paths so engine state is ephemeral wire only.

## What Changes

- Treat AG-UI incremental chunks as the only SDK → channel path. `MESSAGES_SNAPSHOT` SHALL NOT replace the channel (generalize the summary-first guard into a total skip).
- Compaction `onConfig` SHALL rebuild wire from the live channel (`convert` + `getModelVisibleMessages`) every iteration. Returning `{ messages }` remains allowed as a one-shot LLM payload, never as durable state.
- Remove engine-prefer merge in `buildCanonicalModelMessages` and the post-compact `setRunBaselineCount(MAX_SAFE_INTEGER)` hack. `runBaselineCount` is unused after that and SHALL be deleted from the run path.
- Keep channel live during an inner `chat()` loop (early tool results, compact append, turn_context admit) so the next projection does not need engine fallback.
- **Out of scope:** tool-approval persistence (`persist-tool-approvals`), replacing `chat()` with `adapter.chatStream`, shrinking `maxIterations` to 1.

## Capabilities

### New Capabilities

- None. This completes the existing `unified-message-chain` contract.

### Modified Capabilities

- `unified-message-chain`: Durable channel is never replaced by a snapshot or by engine merge. Post-compact wire is always re-projected from the channel; `runBaselineCount` engine-prefer is removed.

## Impact

- `@my-agent/core`: `AgentUIChannel.processChunk`, `suppress-summary-first-snapshot.ts` (or successor), `compaction-middleware.ts`, `build-canonical-model-messages.ts`, `ManagedAgent` baseline accessors, related validates and ARCHITECTURE notes.
- Session persist path unchanged (already reads the channel). Snapshot repair for stringified multimodal remains only if a snapshot is still applied; after total skip it is unused for this path.
- Does not add `@tanstack/ai-persistence`. Engine `this.messages` may still exist inside `chat()`; we stop reading it back.
