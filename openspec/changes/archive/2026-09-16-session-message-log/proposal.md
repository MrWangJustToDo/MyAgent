## Why

Session persistence is O(history) per save: every save appends a **whole-state** checkpoint to `.session.log`, rewrites the full `.session.json` snapshot, then re-reads and rewrites the journal to keep one record. A long conversation therefore re-serializes its entire message history several times per turn — and saves happen on every user message, pump completion, model/effort change, and background token growth. We want a per-message append-only log so a save writes only what changed, and so the file itself is a message-by-message event chain (message + the session state at that point) that can later support rebuild/fork.

## What Changes

- **BREAKING**: Replace the journal+snapshot pair with a single append-only `.agents/sessions/{id}.session.jsonl`. Each line is one message event: the `UIMessage` plus a full snapshot of the non-message session state at that point (`model`, `modelStyle`, cumulative `usage`/`cost`/`contextTokens`, `todos`, `planMode`, `autoMode`, `name`, timestamps). No backward compatibility with v5 files.
- Incremental save: append a line only when that message is new or changed (later line for the same `message.id` wins); when only state changes (e.g. `setModel`/`setReasoningEffort`/background token growth) re-emit the last message line with the new state.
- Load by folding: `state` = the last line's snapshot; `uiMessages` = message lines folded by id (later wins, position = first occurrence).
- Drop the standalone `SessionData.approvals` field and derive approvals from the folded messages' tool-call `approval` parts; preserve the approval timestamp as the `messageUpdatedAt` of the line where the decision first appears.
- Allow the very first line to carry `message: null` (initial/empty-session state, e.g. `reservedAt`); all other lines carry a message. `list()` reads only the newest `state` line.
- `/clear` continues to mean "start a new session"; the low-level in-place `clear` only ever applies to an already-empty session in current command flows. A rare non-empty → empty save rewrites the file to a single `message: null` line (no `reset` record kind).

## Capabilities

### New Capabilities

<!-- None: this is a format/behavior change to the existing session persistence capability. -->

### Modified Capabilities

- `session-store`: Persistence becomes a single append-only `.session.jsonl` message log (incremental append, fold-on-load, first-line `message: null`), replacing the journal + `.session.json` snapshot; `SESSION_VERSION` becomes 6; the standalone `approvals` field is removed in favor of deriving approvals from messages.

## Impact

- `@my-agent/core` persistence: `agent/persistence/session-store.ts`, `session-journal.ts`, `types.ts`, `index.ts` (public exports), `dev/dev-agent.ts`.
- Approval handling: `agent/approval/tool-approval-table.ts` (`normalizeSessionApprovals`/`backfillApprovalsFromUIMessages` become the load path; carry the real approval timestamp instead of `now`), `managers/services/session-service.ts` and `managers/managed-agent-session.ts` (stop persisting the `approvals` field).
- Validate scripts that assert the old file layout: `validate-session-store-lifecycle`, `validate-session-store-errors`, `validate-session-persist-media-failure` (and any other session validators).
- Docs: `packages/core/ARCHITECTURE.md` §6 (storage / write paths / resume), `AGENTS.md` session-persistence notes.
- Relationship to `persist-tool-approvals`: that change adds the standalone `approvals` field this change removes. The resume middleware it introduced (approval table → TanStack `resumeToolState`) is retained; only the session-file representation changes (derived, not stored).
- No backward compatibility: existing `.session.json` / v5 `.session.log` files are not read. Callers keep the same `SessionStore` API (`save`/`load`/`list`/`delete`/…).
