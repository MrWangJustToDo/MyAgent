## 1. Types & constants

- [x] 1.1 `agent/persistence/types.ts`: bump `SESSION_VERSION` to 6; replace `SESSION_FILE_SUFFIX` / `SESSION_JOURNAL_KIND` / `journalSeq` with the `.session.jsonl` suffix.
- [x] 1.2 Define the log line type in `types.ts`: `{ t: "message"; message: UIMessage | null; messageUpdatedAt: number; state: SessionStateFields; approvalAt?: Record<string, number> }`, and `SessionStateFields = Omit<SessionData, "uiMessages" | "approvals">`.
- [x] 1.3 Remove the standalone `approvals` field from `SessionData`.
- [x] 1.4 Update `agent/persistence/index.ts` public exports (drop journal symbols, expose the new log helpers/types as needed).

## 2. Log I/O and folding (`session-journal.ts`)

- [x] 2.1 Implement `appendLogLines` (append-only, creates the file if missing, no-op when `appendFile` is unavailable) and `readLog` (skip torn/corrupt lines).
- [x] 2.2 Implement `readLastState` with a `{"t":"message"` prefilter so metadata listing never parses message bodies.
- [x] 2.3 Implement `foldLog`: `state` = newest line's snapshot; `uiMessages` = message lines folded by `UIMessage.id` (later wins, first-seen position); ignore a first-line `message: null`.
- [x] 2.4 Derive `approvalAt` during fold: the `messageUpdatedAt` of the earliest line in which each tool call's approval first appears decided.

## 3. SessionStore rewrite

- [x] 3.1 `save`: compute per-message fingerprints, append lines for new/changed messages only, and skip all IO (and `updatedAt`) when nothing changed.
- [x] 3.2 `save`: re-emit the last message line when only non-message state changed (covers `persistSession()`'s model-state-only path).
- [x] 3.3 `save`: handle an empty session's first save with `message: null`; handle non-empty → empty by rewriting the file to a single `message: null` line.
- [x] 3.4 `load`: reconstruct via `foldLog`; prime the in-memory delta baseline so the first save after resume appends only what changed.
- [x] 3.5 `list` / `delete` / `getLatest` / `getLatestEmpty` / `reserveSession` / `releaseReservation` / `rename` / `clearCache`: operate on `.session.jsonl`, keeping the existing public API and per-session save lock.

## 4. Approvals derived from messages

- [x] 4.1 `managers/services/session-service.ts`: stop writing/reading the `approvals` field.
- [x] 4.2 `managers/managed-agent-session.ts`: derive the approval table on restore via `normalizeSessionApprovals` / `backfillApprovalsFromUIMessages`.
- [x] 4.3 `agent/approval/tool-approval-table.ts`: carry the real decision timestamp (`approvalAt`) instead of `now` when reconstructing records.
- [x] 4.4 Remove remaining `SessionData.approvals` references.

## 5. Validators

- [x] 5.1 Update `validate-session-store-lifecycle` to the `.jsonl` layout (append-only, no snapshot, no-op save, delete removes the log).
- [x] 5.2 Update `validate-session-store-errors` mock fs to recognize `.session.jsonl`.
- [x] 5.3 Update `validate-session-persist-media-failure` seed data to the new format.
- [x] 5.4 Add `validate-session-message-log`: incremental append (only changed messages), fold equals the saved session, state-only re-emit, no-op save, non-empty → empty rewrite, and approval derivation with `approvalAt`; register a `validate:session-message-log` script.

## 6. Docs

- [x] 6.1 Update `packages/core/ARCHITECTURE.md` §6 (storage layout, write paths, resume/fold) for the message log.
- [x] 6.2 Update the session-persistence notes in `AGENTS.md` (file name/format).
- [x] 6.3 Format changed files (`prettier`) and lint.

## 7. Verification

- [x] 7.1 `pnpm --filter @my-agent/core typecheck` and `pnpm typecheck`.
- [x] 7.2 `pnpm --filter @my-agent/core build`.
- [x] 7.3 Run the session validators (`session-store-lifecycle`, `session-store-errors`, `session-persist-media-failure`, `session-message-log`, `session-identity`, `session-model-persistence`, `session-reuse-log`) plus the other affected `validate:*` scripts.

## 8. Review follow-ups (found in code review of the implementation)

- [x] 8.1 `foldLog` treated the explicit per-line `approvalAt` as dead code (inference ran first and shadowed it), so a whole-log rewrite silently replaced the decision time with the rewrite stamp. Apply explicit entries before inferring; add a regression assertion (rewrite keeps the original decision time).
- [x] 8.2 `appendLogLines` returns `false` when the env fs lacks the optional `appendFile`, and the caller ignored it — the save was silently dropped while the delta baseline still advanced (permanent no-op). Degrade to a full rewrite; assert the fallback writes and stays durable.
- [x] 8.3 `doSave` read `session.uiMessages` after its first `await`, so a concurrent persist swapping the array could desync the fingerprints (duplicate appends). Snapshot the message list (and the derived `state` fields) before any await.
- [x] 8.4 Document that legacy v4/v5 `.session.json` files are neither listed nor loaded (no migration).
