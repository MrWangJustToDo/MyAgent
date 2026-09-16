## Context

Approval lives on UIMessage tool-call parts (`state`, `approval`) and in TanStack `StreamProcessor` memory. Wire conversion drops those fields. `extractClientStateFromOriginalMessages` only restores `state === "approval-responded"` with `approved !== undefined`. Pending approvals and some denied reasons therefore fail across a new `chat()` or a process restart.

`@tanstack/ai-persistence` `withPersistence` is the official pattern: persist interrupts, translate to `ChatResumeToolState` in `onConfig`, clear ephemeral `resume`. We already persist chronological `uiMessages` in `.agents/sessions/*.json` and send the full channel on every pump. Adopting that package would also persist a ModelMessage transcript store (required), which overwrites history at interrupt/finish.

Companion change `unidirectional-message-pipeline` stops snapshot replace; this change still needed because approval is interrupt state, not message data.

## Goals / Non-Goals

**Goals:**

- First-class session `approvals` covering pending, approved, and denied (reason included).
- Each `chat()` `onConfig` rebuilds `resumeToolState.approvals` from that table (plus in-memory updates this process already made).
- Copy `resumeToolStateFromPending` semantics without adding `@tanstack/ai-persistence`.

**Non-Goals:**

- Server-authoritative empty-`messages` resume.
- `runs` store / `withPersistence` dependency.
- Changing whether tools require approval (plan auto-approve / `/auto` stay as today).
- Fixing summary-first snapshot overwrite (other change).

## Decisions

### D1: Session JSON is the interrupt store

**Choice:** `SessionData.approvals?: ToolApprovalRecord[]`. Optional; omitted on old files means `[]`. Do not bump `SESSION_VERSION` solely for this (same as `planMode` / `autoMode`).

Record (minimum):

- `id`: approval id (`approval_call_${toolCallId}` when present)
- `toolCallId`
- `status`: `pending` | `approved` | `denied`
- `reason?`: deny text
- `updatedAt`

**Alternative:** Extract from `uiMessages` on resume only. Rejected as SoT — snapshots and wire rebuilds can strip part fields; the table must survive that.

**Alternative:** Add `@tanstack/ai-persistence` and implement three stores. Rejected — `messages` store is ModelMessage full-overwrite.

### D2: What goes into `resumeToolState`

TanStack `ToolApprovalResolution` is a decision, not a pending wait.

- `approved` → `resumeToolState.approvals` true (or `{ approved: true }`)
- `denied` → `{ approved: false, payload: { reason } }` (keep existing denial-reason application on the channel)
- `pending` → persist for UI/session; **omit** from `resumeToolState.approvals` so `executeToolCalls` still interrupts

Keys in the map: the record `id` and `toolCallId` (SDK `approvalResolution` accepts `toolCallId` or `approval_${toolCallId}`; live ids are `approval_call_*`).

### D3: Write sites

- `AgentChatController.respondToToolApproval` / `ManagedAgent` equivalents: upsert approved/denied
- Plan-building and `/auto` auto-approve: upsert approved
- When the model first requests approval (channel part `approval-requested`): upsert pending if missing
- Persist with `maybeSaveSessionUIMessages` / session save so a crash after `y`/`n` still has the row

### D4: Thin `onConfig` middleware

**Choice:** New middleware, e.g. `createApprovalResumeMiddleware`, returns `{ resumeToolState: { approvals: Map } }`. `onConfig` is shallow-merge, so it composes with compaction `messages`.

Do not pass `chat({ resume })` ephemeral items; do not clear a client resume batch we never send.

Register in `run-agent.ts` beside existing middleware.

### D5: Restore

`restoreFromStore` / `restoreSession` loads `approvals` into the agent (in-memory table). `initChat` / next pump uses middleware against that table. Channel still hydrates `uiMessages` for display.

## Risks / Trade-offs

- **[Risk] Dual key mismatch (`approval_call_*` vs `approval_*`)** → Mitigation: set both `id` and `toolCallId` on the Map; validate against a session file that has real approval ids.
- **[Risk] Pending stored but SDK re-asks** → Expected: pending is not a resolution. UI still waits; user answers again only if the part was also lost (unidirectional change reduces that).
- **[Risk] Table and parts disagree** → Table wins for `resumeToolState`. Channel parts remain the transcript.
- **[Trade-off] Extra session field** → Small; optional; no package dual-track.

## Migration Plan

Old sessions without `approvals` load as `[]`. Best-effort: on restore, backfill pending/responded rows from remaining tool-call parts so a file that still has `approval` fields works before the table was written.

## Open Questions

- None blocking. Edited-args approvals are out of scope unless a call site already uses them.
