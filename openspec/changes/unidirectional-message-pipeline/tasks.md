## 1. Snapshot skip

- [x] 1.1 Change `AgentUIChannel.processChunk` so every `MESSAGES_SNAPSHOT` is dropped (not only summary-first)
- [x] 1.2 Replace or extend `shouldSuppressSummaryFirstSnapshot` with a total-skip helper; keep `shouldSuppressReplayedToolChunk`
- [x] 1.3 Update `validate:suppress-summary-first-snapshot` (or successor) to assert ordinary snapshots also leave the chronological channel intact

## 2. Channel-only wire projection

- [x] 2.1 Rewrite compaction `onConfig` to convert `channel.getMessages()`, optionally compact-append, then `getModelVisibleMessages` — never `buildCanonicalModelMessages(ui, engine, baseline)`
- [x] 2.2 Remove post-compact `setRunBaselineCount(Number.MAX_SAFE_INTEGER)`
- [x] 2.3 Confirm `early-tool-result-ui-middleware` still patches the channel before the next inner iteration; add a channel patch if a remaining engine-only update is found (do not restore engine-prefer)

## 3. Remove engine-prefer merge

- [x] 3.1 Delete `runBaselineCount` set/get from the `ManagedAgent` run path and compaction deps
- [x] 3.2 Remove `buildCanonicalModelMessages` from production callers; delete the helper and `validate:canonical-model-messages` if unused, or shrink it to channel convert-only
- [x] 3.3 Update `validate:message-chain-projection` / compaction validates so post-compact same-request wire is channel-projected without baseline hacks

## 4. Docs and verify

- [x] 4.1 Update `packages/core/ARCHITECTURE.md` §6.4 (channel ↔ wire) and any AGENTS.md notes that describe engine-prefer / `runBaselineCount`
- [x] 4.2 Format/lint changed files; `pnpm build:core`; run affected `validate:*` (snapshot skip, message-chain-projection, early-tool-result-ui, compaction)
