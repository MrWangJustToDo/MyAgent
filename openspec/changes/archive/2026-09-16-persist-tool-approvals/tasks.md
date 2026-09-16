## 1. Schema and session I/O

- [x] 1.1 Add `ToolApprovalRecord` (+ zod) and optional `approvals` on `SessionData` in `packages/core/src/agent/persistence/types.ts`
- [x] 1.2 Persist and restore `approvals` in `SessionService`; treat missing field as `[]`
- [x] 1.3 On restore, best-effort backfill from UIMessage tool-call `approval` parts when the table is empty

## 2. Write path

- [x] 2.1 Add an in-memory approvals table on the managed agent / session service with upsert helper
- [x] 2.2 Upsert `pending` when a tool enters `approval-requested`
- [x] 2.3 Upsert `approved` / `denied` (with reason) from `respondToToolApproval` and auto-approve paths
- [x] 2.4 Include `approvals` in the same persist triggers as `uiMessages` (`user-message` / `pump-complete` / force)

## 3. Resume middleware

- [x] 3.1 Add helper: table → `Map` of `ToolApprovalResolution` (approved/denied only; dual keys `id` + `toolCallId`)
- [x] 3.2 Add `onConfig` middleware returning `{ resumeToolState: { approvals } }`; register in `run-agent.ts`
- [x] 3.3 Do not add `@tanstack/ai-persistence`

## 4. Validate and docs

- [x] 4.1 Add `validate:tool-approval-resume` covering pending omit, approved resume, denied+reason, old file without field, compose with a dummy `messages` onConfig
- [x] 4.2 Update ARCHITECTURE / AGENTS session persist notes for the `approvals` field
- [x] 4.3 Format/lint changed files; `pnpm build:core`; run the new validate plus session-related validates
