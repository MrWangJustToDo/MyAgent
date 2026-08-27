## Context

Session persistence today is a full-file JSON overwrite: `SessionService.save()` (the central funnel, `managers/session-service.ts:160/166/221`) calls `SessionStore.save()`, which serializes the whole `SessionData` and writes `.agents/sessions/{id}.session.json` (`agent/persistence/session-store.ts`). The write is not atomic — a crash mid-write can leave a truncated/corrupt file and loses everything after the last successful save.

The read side is fully decoupled from storage: `SessionStore.load()` returns a complete `SessionData`, and every consumer (local snapshot, remote channel, UI, resume, compaction) only ever reads `SessionData`. `CoreEnvFs` (`core/src/env.ts:102`) is runtime-agnostic and exposes `appendFile?` (optional, implemented by node and the HTTP remote env). `SESSION_VERSION` is 4; binary media is already externalized to `.agents/media/` and stored as `media://` refs.

## Goals / Non-Goals

**Goals:**
- Make session writes crash-safe with a durable append-only journal, keeping the existing `SessionData` read contract untouched.
- Recover the latest durable state after a crash between journal append and snapshot write, or after a corrupt snapshot.
- Keep the journal bounded; keep v4 snapshot-only files loadable with no migration.
- Establish the record envelope (`v`, `seq`, `kind`) so a later slice can add semantic per-mutation events to the same journal.

**Non-Goals:**
- Semantic per-mutation events (`message.added`, `todo.replaced`, `tool.approved`), durable admission inbox, background jobs, incremental message channel — future slices.
- Cross-process locking / fencing / multi-writer coordination.
- Replaying or re-hydrating media binaries from the journal (media is already content-addressed separately; the journal stores `media://` refs exactly like the snapshot).

## Decisions

### D1. Journal format: JSONL, one versioned record envelope per line


Each append is one line:

```json
{"v":1,"seq":42,"kind":"checkpoint","ts":1756112345678,"data":{...SessionData...}}
```

- **Why JSONL over a single JSON array**: append is a natural `appendFile`; tail replay reads only the lines after a known seq; a torn partial last line (crash mid-append) is detectable and droppable without corrupting the rest.
- **Alternatives considered**: single JSON array (each append rewrites the whole file → no crash benefit), SQLite/WAL (heavy, breaks runtime-agnostic CoreEnv), binary (hard to debug). JSONL wins on simplicity + crash properties.
- `kind: "checkpoint"` reserves the field for future `message`/`todo`/`approval` records; the reader ignores unknown `kind`s so old binaries and old logs interoperate.

### D2. Write flow: append (durable) then snapshot (cache), journal truncated after snapshot

`SessionStore.save(session)` becomes:

1. Skip entirely if the serialized state is unchanged (existing `lastSavedHash` check) — no append, no snapshot.
2. `seq = (session.journalSeq ?? 0) + 1`; update `session.journalSeq = seq`; serialize the record envelope; `fs.appendFile(logPath, line + "\n")` — the durable write.
3. Write the `.session.json` snapshot capturing the PREVIOUS durable state (`journalSeq = seq - 1`), so the journal's newest checkpoint stays strictly ahead of the snapshot and is the load-time source of truth. Snapshot cadence in slice 1: **every save** (behavior parity — the diff is only "journal is appended first and is the canonical copy"). Throttling the snapshot to a run-boundary or every N saves is a low-risk follow-up; the seq/truncation mechanism below already supports it.
4. Truncate the journal to lines with `seq > (seq - 1)` (i.e. drop everything but the newest checkpoint). Because the snapshot lags one seq, the journal always ends up holding exactly the latest checkpoint — never empty for a journal-backed session, and never growing. A crash during truncation leaves a pre-truncation log that is still fully readable and self-heals on the next save.

**Why append-before-snapshot**: the snapshot overwrite is the crash-prone step; the journal append is the recoverable one. A crash in the window between 2 and 4 leaves the previous snapshot plus a journal record one step newer → load replays it.

**Why every-save snapshot in slice 1**: minimal behavior change, zero risk to the existing write cadence. The value added is crash-safety (recovery from the WAL) and the journal foundation, not yet fewer writes.

### D3. Load: snapshot first, replay journal tail, prefer journal on mismatch

`SessionStore.load(id)`:

1. Read `.session.json` → `snapshot` (null if missing/unreadable).
2. Read the journal; take `lastSeq` (largest valid `seq`, dropping a torn trailing line) and the record with the largest `seq` (`lastRecord`).
3. If no journal: return `snapshot` (v4 path unchanged).
4. If journal exists: if `lastRecord.seq > (snapshot?.journalSeq ?? 0)` or snapshot is missing → return `lastRecord.data` (with `journalSeq = lastRecord.seq`). Otherwise return the snapshot (its `journalSeq` already reflects the newest durable record).

**Why snapshot-then-tail rather than always-journal**: snapshot-only v4 files fall through with zero replay; for journal-backed sessions the lagging snapshot makes the newest journal record always strictly ahead, so the journal is the consistent winner and the snapshot is a redundant fallback. The same branch handles crash recovery (journal ahead of a stale snapshot) and corrupt/missing snapshots.

**Torn trailing line**: a final line that fails to parse is dropped (the in-flight save is treated as not-happened — same semantics as today's "save lost on crash", but bounded to a single in-flight record).

### D4. seq lives on the snapshot via `journalSeq` (SessionData v5)

Add optional `journalSeq?: number` to `SessionData`. It records the seq of the state the snapshot reflects. v4 files omit it (treated as 0). The journal envelope carries its own `seq`; the `data.journalSeq` inside a checkpoint equals that record's `seq` (self-consistent).

**Alternatives considered**: a sidecar meta file (extra file to keep in sync), deriving nextSeq by scanning the whole journal each save (O(log) work on every save). Embedding in `SessionData` is simplest and survives the snapshot, so the next `seq` is always one lookup away.

### D5. Journal lifecycle and listing

- Journal path: `.agents/sessions/{id}.session.log` (same dir as the snapshot).
- `list()`/`getLatest()`/`findByName()` read metadata — they SHALL ignore `.session.log` files and keep reading the `.session.json` metadata exactly as today.
- `delete(id)` removes both the snapshot and the journal.
- `rename`/title writes flow through the same `save()` (journal + snapshot), unchanged.

## Risks / Trade-offs

- **[Whole-state journal grows between snapshots]** → In slice 1 the journal is truncated after every snapshot, so it holds at most a one-record tail; if snapshot throttling is added later, the journal can hold N full copies (wasteful but bounded and correct). Slice 2 replaces whole-state records with small semantic events.
- **[Optional `appendFile` on CoreEnvFs]** → Environments lacking `appendFile` fall back to the current snapshot-only behavior (no journal, no crash recovery). Node and the HTTP remote env already implement it.
- **[Two files per session to keep consistent]** → The journal is canonical; the snapshot is a cache. Load always prefers the journal when it is ahead, so inconsistency resolves to the journal, never to a stale snapshot.
- **[Behavior-parity snapshot on every save adds one append per save]** → A cheap append vs. the existing full-JSON overwrite it precedes; it is strictly more work per save but strictly more durable. Optional throttle later.
- **[Compaction rewrites messages in a checkpoint]** → A compaction result is just another whole-state checkpoint; replay is whole-state so it stays consistent. Semantic-event replay + compaction barrier is a slice-2 concern and is explicitly out of scope here.

## Migration Plan

- `SESSION_VERSION` 4 → 5. New sessions write v5 (with `journalSeq`). Old v4 files load unchanged (no journal → snapshot path).
- **Legacy sessions self-upgrade on first save.** Reading a v4 file never writes anything; the first `save()` on a legacy session creates `{id}.session.log` (seq starts at 1), appends the first checkpoint, and rewrites the snapshot at v5 with a lagging `journalSeq`. After that it behaves exactly like a new journal-backed session — no explicit migration step, the upgrade is implicit and idempotent.
- **Fallback (no journal).** In environments where `fs.appendFile` is unavailable, `save()` skips the journal entirely and stays a pure snapshot overwrite — byte-for-byte the previous behavior; legacy and new sessions alike.
- Rollback: if the change is reverted, the extra `.session.log` files are ignored by `list()` and the snapshot remains valid — old binaries keep working.

## Open Questions

- Snapshot throttle policy for the follow-up slice (every-N-saves vs run boundary) — deferred; slice 1 keeps every-save parity.
- Whether future slices should migrate the journal to semantic events in place (new `kind`s) or start a fresh journal file format (`v:2`). The envelope's `v` field leaves both options open.
