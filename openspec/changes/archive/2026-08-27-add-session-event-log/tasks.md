## 1. Journal module

- [x] 1.1 In `packages/core/src/agent/persistence/types.ts`: bump `SESSION_VERSION` to 5, add `SESSION_LOG_SUFFIX = ".session.log"`, add optional `journalSeq?: number` to `SessionData`, and add a `sessionJournalRecordSchema` (`v`, `seq`, `kind`, `ts`, `data`) with a `checkpoint` kind.
- [x] 1.2 Create `packages/core/src/agent/persistence/session-journal.ts`: `appendCheckpoint(fs, path, seq, session)` (one JSONL line via `fs.appendFile`), `readJournal(fs, path)` (parse lines, drop a torn trailing line, return records sorted by seq), `lastRecord(records)`, and `truncateAfter(fs, path, seq)` (rewrite lines with `seq > N` via temp file + rename, or remove the file when empty).
- [x] 1.3 Export the new journal helpers from `packages/core/src/agent/persistence/index.ts` (or the module's existing export surface) so `SessionStore` can import them.

## 2. SessionStore integration

- [x] 2.1 Rework `SessionStore.save()` in `packages/core/src/agent/persistence/session-store.ts`: keep the `lastSavedHash` no-op skip, then `seq = (session.journalSeq ?? 0) + 1`, append a checkpoint record to `{id}.session.log`, set `session.journalSeq = seq`, write the `.session.json` snapshot, then truncate the journal to `seq > session.journalSeq`.
- [x] 2.2 Rework `SessionStore.load()`: read the snapshot, read the journal, and return the newest journal record when its `seq > (snapshot?.journalSeq ?? 0)` or the snapshot is missing/corrupt; otherwise return the snapshot unchanged (v4 snapshot-only path).
- [x] 2.3 Update `SessionStore.delete()` to also remove the `.session.log` file, and confirm `list()`/`getLatest()`/`findByName()` keep ignoring `.session.log` files (they already filter on `SESSION_FILE_SUFFIX`).
- [x] 2.4 Confirm all callers of `save()`/`load()` (`managers/session-service.ts`, `agent-session/session-lifecycle-commands.ts`) need no signature changes — verify `SessionData.journalSeq` is treated as internal metadata and is not surfaced to hosts.

## 3. Recovery & truncation hardening

- [x] 3.1 Ensure `load()` handles a torn trailing journal line (drop it) and a corrupt snapshot with a valid journal (rebuild from the newest complete record).
- [x] 3.2 Ensure `appendCheckpoint` is safe when the journal file does not exist yet (creates it) and when `fs.appendFile` is unavailable (fall back to snapshot-only, current behavior).

## 4. Verification

- [x] 4.1 Write a temp verification script under `.agents/` (repo convention) that exercises against the built core dist: first save creates journal + snapshot, unchanged save appends nothing, a "crash between append and snapshot" (journal ahead of snapshot) recovers via load, a corrupt snapshot recovers from the journal, truncation leaves only `seq > snapshot.seq`, and a v4 snapshot-only file loads unchanged.
- [x] 4.2 Run `pnpm typecheck` and the core package build (`pnpm build:core` or the affected-package build per AGENTS.md); fix any diagnostics.
