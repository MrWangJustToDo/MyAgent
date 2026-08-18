## Context

Durable conversation state already lives on `AgentUIChannel` (chronological UIMessage, persisted as `uiMessages`). TanStack `chat()` still owns a mutable engine copy (`this.messages` as ModelMessage). Compaction middleware returns a summary-first projection into that engine. On tool-approval / client-tool interrupt, `buildMessagesSnapshotChunk` emits `MESSAGES_SNAPSHOT` from the engine; `StreamProcessor.handleMessagesSnapshotEvent` replaces the channel. `c4cdfa7` skips snapshots whose first message is a compaction summary. Ordinary snapshots still replace. `buildCanonicalModelMessages` merges UI prefix with engine suffix using `runBaselineCount` because the channel used to lag mid-run.

Constraints: do not modify `node_modules/@tanstack/ai`. Do not add `@tanstack/ai-persistence`. Session persist already reads the channel. Companion change `persist-tool-approvals` owns approval SoT.

## Goals / Non-Goals

**Goals:**

- Channel remains the only durable UIMessage store; SDK chunks only append/patch it.
- Every `onConfig` wire payload is a pure projection from the live channel.
- Engine `this.messages` is ephemeral for the current LLM call and is never merged back.
- Delete `runBaselineCount` from the run path once nothing reads it.

**Non-Goals:**

- Replacing `chat()` with `adapter.chatStream` (later architecture change).
- Persisting tool approvals (see `persist-tool-approvals`).
- Shrinking `maxIterations` to 1 in this change.
- Introducing a second persistence store or `@tanstack/ai-persistence`.

## Decisions

### D1: Skip every `MESSAGES_SNAPSHOT` on the channel

**Choice:** `AgentUIChannel.processChunk` returns without applying any `MESSAGES_SNAPSHOT`. Incremental TEXT/TOOL chunks plus `addToolResult` / `addToolApprovalResponse` already keep the channel current. `shouldSuppressReplayedToolChunk` still drops continuation START/ARGS.

**Alternative:** Keep applying ordinary snapshots, only skip summary-first. Rejected — that is the remaining whole-table replace, and snapshots rebuild tool-call parts as `input-complete` without approval.

**Alternative:** Merge snapshot metadata into existing parts without replacing the array. Rejected for this change — extra reconcile surface; skip is enough if the channel is live.

### D2: `onConfig` always projects from the channel

**Choice:** Compaction middleware:

1. Convert `channel.getMessages()` to model messages.
2. Optionally compact and append SUMMARY onto the channel.
3. Return `{ messages: getModelVisibleMessages(fromChannel) }` for this LLM call only.

Do not call `buildCanonicalModelMessages(ui, engine, baseline)`. After compact, do not `setRunBaselineCount(MAX_SAFE_INTEGER)`.

**Alternative:** Keep returning projected messages and also keep engine-prefer for later inner iterations. Rejected — that is the dual-write.

Returning `{ messages }` still writes the engine for this call. The next `onConfig` MUST rebuild from the channel, not from that engine array.

### D3: Delete engine-prefer merge

**Choice:** Remove `buildCanonicalModelMessages` from the run path. If the helper is unused, delete it and `validate:canonical-model-messages`, or reduce the helper to `convertMessagesToModelMessages(ui)` and keep the validate as identity.

**Why now:** `early-tool-result-ui-middleware` writes each server tool result onto the channel in `onAfterToolCall`. `prepareForRun` admits `turn_context` onto the channel. Recovery already uses `() => managed.ui.getMessages()`. The lag that justified engine-prefer is gone.

If a later validate finds an in-place engine-only update (structured output, max-tokens continuation), patch the channel at that site. Do not reopen engine-prefer.

### D4: `runBaselineCount` leaves the run path

**Choice:** After D2/D3, stop setting and reading `_runBaselineCount` on `ManagedAgent`. Delete accessors once call sites are gone.

### D5: Do not adopt `withPersistence` for transcripts

Its required `messages` store is a full ModelMessage overwrite at interrupt/finish — the same write-back this change forbids. Approval resume is a separate change.

## Risks / Trade-offs

- **[Risk] Skipping snapshots drops interrupt metadata** → Mitigation: incremental chunks + early tool-result + channel `addToolApprovalResponse`. Validate compact-then-approval: chronological summary stays at tail; pre-compact rows remain.
- **[Risk] Inner `chat()` iteration after compact still needs fresh wire** → Mitigation: every `onConfig` re-reads the channel; compact append happens before the return.
- **[Risk] Some engine-only in-place update still exists** → Mitigation: add a channel patch at that site; do not restore merge.
- **[Trade-off] TanStack engine copy still exists** → Accepted until a later change owns the loop. This change only stops trusting it.

## Migration Plan

No session migration. Guard-only snapshots become a total skip; older sessions with already-collapsed history stay as stored.

## Open Questions

- None blocking. `maxIterations: 1` and `chatStream` stay for a later change.
