## Context

Session persistence currently keeps two copies of the whole session: an append-only JSONL journal of **whole-state checkpoints** (`.agents/sessions/{id}.session.log`) and a materialized `.session.json` snapshot (`agent/persistence/session-store.ts`, `session-journal.ts`). Every `save()`:

1. `JSON.stringify(session)` for the no-op hash,
2. appends a full-state checkpoint to the journal,
3. rewrites the full snapshot,
4. re-reads and rewrites the journal to keep only the newest record.

That is several full serializations and two full file writes per save, and saves are frequent: every user message, every pump completion, and every model-state-only persist (`persistSession()` in `managers/managed-agent.ts` — `setModel`, `setReasoningEffort`, background token growth). Long conversations pay O(history) per save.

We want a message-granular log: one line per message carrying the session state at that point, appended incrementally, folded on load. This also makes the file a natural message-by-message event chain for a future rebuild/fork capability.

## Goals / Non-Goals

**Goals:**

- One file per session, `.agents/sessions/{id}.session.jsonl`, append-only.
- Each line = one `UIMessage` + a full snapshot of the non-message session state at that point (`model`, `modelStyle`, cumulative `usage`/`cost`/`contextTokens`, `todos`, `planMode`, `autoMode`, `name`, timestamps).
- A save writes only what changed; load reconstructs by folding lines by message id.
- Approvals are derived from message tool-call parts, not stored as a separate field.
- Keep the `SessionStore` public API (`create`/`save`/`load`/`list`/`delete`/`rename`/`getLatest`/`getLatestEmpty`/`reserveSession`/`releaseReservation`/`findByName`/`clearCache`) unchanged for hosts.

**Non-Goals:**

- Fork/rebuild command surface (only the underlying file shape supports it).
- Changing command semantics (`/clear` stays "start a new session").
- Backward compatibility with v5 `.session.log` / `.session.json` files.
- Wire-projection caching (`session-messages-incremental`) and transport changes.
- Automatic log compaction (deferred; see Open Questions).

## Decisions

### 1. One append-only `.jsonl`, line = message + state snapshot

Rejected alternatives: (a) JSON-Patch/delta records with `base`/`count` — more machinery than needed; (b) separate typed `state` lines — breaks "one line per message" and complicates folding. Each message line carries the **full** non-message state, so any prefix of the log is a complete session snapshot at that point.

Line shape:

```jsonc
{
  "t": "message",
  "message": { "id": "msg_…", "role": "assistant", "parts": [ … ], "createdAt": 1789090000000 },
  "messageUpdatedAt": 1789090005000,
  "state": {                     // SessionData minus uiMessages (and minus approvals)
    "id": "ses_…", "name": "…", "version": 6, "modelStyle": "openai", "model": "…",
    "usage": { … }, "cost": 0.0123, "contextTokens": 123456,
    "todos": [ … ], "todoTitle": null, "todoPlanBound": false,
    "reasoningEffort": "medium", "planMode": null, "autoMode": false,
    "reservedAt": …, "createdAt": …, "updatedAt": …
  }
}
```

`message: null` is allowed **only on the first line** (initial/empty-session state, e.g. `reservedAt` for startup reuse). All other lines must carry a message.

### 2. Fold on load; later line wins by id

```
state    = last line's .state                        // full snapshot, replaces
uiMessages = message lines folded by UIMessage.id    // later wins; position = first occurrence
approvals = derive from the folded messages' tool-call approval parts
```

### 3. Incremental write and no-op detection

`SessionStore` keeps per-session `{ ids: string[], fingerprints: Map<id,string>, signature }` from the last durable write. `fingerprintUIMessage` (already exists in `session-sync-tracker.ts`) detects per-message changes without serializing message bodies. A save appends:

- one line per message that is new or whose fingerprint changed;
- if only non-message state changed (no message changed), re-emit the **last** message line with the new state (`persistSession()`'s model-state-only path is a first-class case, not an edge case);
- nothing at all when both messages and state are unchanged (keeps the existing no-op-save behavior and `updatedAt`).

### 4. Approvals derived from messages

`SessionData.approvals` is removed. On load, `normalizeSessionApprovals`/`backfillApprovalsFromUIMessages` rebuild the table from the folded messages' tool-call parts. This supersedes the session-file portion of the `persist-tool-approvals` change while keeping its resume middleware (the derived table still feeds `resumeToolState`).

**Timestamps**: `message.createdAt` is the message creation time. `messageUpdatedAt` is the line's write time. A line may also carry an explicit `approvalAt` map — the real decision time, recorded when the approval was first persisted. On fold, **explicit entries win**; anything not covered falls back to the `messageUpdatedAt` of the earliest line in which that approval first appears decided (approved/denied). Explicit-first is what keeps the decision time stable across later re-emits and whole-log rewrites, both of which restamp every line with the current time.

### 5. Non-empty → empty rewrites the file

`/clear` starts a new session, and the low-level in-place `clear` only lands on an already-empty session in current command flows. If a save ever observes a non-empty session becoming empty, rewrite the file to a single `message: null` line instead of introducing a `reset` record kind — the format stays "one message per line".

### 6. `list()` reads only the newest state line

`list()` prefilter-parses lines starting with `{"t":"state"` and keeps the last, so metadata listing never parses message bodies.

### 7. No backward compatibility; `SESSION_VERSION = 6`

Old `.session.json` / v4 / v5 files are not read. `SessionStore` API is unchanged, so hosts need no changes.

## Risks / Trade-offs

- [Non-atomic rewrite (non-empty → empty, and future compaction)] → same exposure as today's snapshot/journal rewrites; only triggered on rare structural events.
- [Approval timestamp lost if lines are ever collapsed/compacted] → compaction is a Non-Goal here; if added, it MUST preserve the earliest decided-line `messageUpdatedAt`.
- [File grows with re-emitted lines (streaming / state-only saves)] → growth is O(saves), not O(saves × history), because only changed messages are written; compaction is deferred.
- [Per-save fingerprinting is O(messages)] → string work only, no full serialization; strictly cheaper than the current `JSON.stringify(session)`.
- [Fold assumes message ids are stable across a session] → they are (`UIMessage.id`); compaction summaries use stable ids too.

## Migration Plan

1. Bump `SESSION_VERSION` to 6; add `.session.jsonl` suffix and line types.
2. Rewrite `session-journal.ts` as the log I/O + `foldLog`; rewrite `SessionStore.save`/`load`/`list`/`delete` to the new format.
3. Drop `approvals` from `SessionData`; make the load path derive approvals (with the earliest-decided-line timestamp).
4. Update validate scripts that assert the old layout, and docs (`ARCHITECTURE.md` §6, `AGENTS.md`).
5. No migration/rollback shim: existing files are simply not read (pre-1.0 format change).

## Open Questions

- Compaction threshold for the log (when to rewrite to one-line-per-message); deferred. A rewrite must preserve `approvalAt` (the explicit per-line map does this).
- Whether subagents own a persisted session log at all; if they do, the same rules apply to their (currently ephemeral) channels.
