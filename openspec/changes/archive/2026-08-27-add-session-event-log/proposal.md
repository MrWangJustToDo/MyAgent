## Why

Session persistence is a full-file JSON overwrite (`SessionStore.save` writes `.agents/sessions/{id}.session.json`). A crash mid-write can leave a truncated/corrupt file and loses everything after the last successful save; there is no durable, append-only record of a session's evolution. This blocks crash recovery, audit/replay, and the next generation of features (idempotent admission, background jobs, incremental message channels). OpenCode V2's core lesson is that live state must be rebuildable from a durable log. This change is the smallest first step toward that: add a durable journal **without changing the read path** — every consumer (snapshot, remote channel, UI, resume) still reads `SessionData` as today.

## What Changes

- Add an append-only JSONL journal `.agents/sessions/{id}.session.log` next to the session file.
- `SessionStore.save()` appends a durable, seq-numbered whole-state checkpoint record (write-ahead) before the snapshot write; `.session.json` becomes a periodically-materialized snapshot rather than the source of truth.
- `SessionStore.load()` reads the snapshot and replays the journal tail (records newer than the snapshot's recorded seq) to reconstruct the current `SessionData` — so a crash between journal append and snapshot write is recoverable.
- Keep the journal bounded: after a snapshot write, truncate it to records newer than the snapshot seq.
- Bump `SESSION_VERSION` to 5; existing v4 snapshot-only files (no journal) keep loading unchanged. No migration required.
- The journal record format reserves a `kind` field so future slices can mix whole-state checkpoints with semantic per-mutation events.
- **Out of scope (slice 2+):** semantic per-mutation events (`message.added`, `todo.replaced`, `tool.approved`), durable admission inbox, background jobs, incremental message channel.

## Capabilities

### New Capabilities

- `session-event-log`: Durable append-only JSONL journal with seq-numbered whole-state checkpoints, tail replay on load, bounded truncation, and crash recovery.

### Modified Capabilities

- `session-store`: Session load becomes snapshot + journal tail replay; save becomes journal append + throttled snapshot; schema version bumps to 5; older snapshot-only files remain loadable.

## Impact

- `@my-agent/core`: `agent/persistence/session-store.ts` (save/load path), `agent/persistence/types.ts` (`SESSION_VERSION`, journal record schema), `managers/session-service.ts` (the central save funnel — callers unchanged).
- New file: `agent/persistence/session-journal.ts` (+ unit tests under `packages/core/test/`).
- Media store is unaffected: the journal stores `media://` refs exactly like the snapshot already does.
- Hosts unchanged: remote/UI/resume all consume `SessionData` through the existing `load()`/snapshot path, so the journal is invisible to them.
