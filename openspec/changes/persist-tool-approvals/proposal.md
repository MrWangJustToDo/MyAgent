## Why

Tool approval state is a TanStack interrupt, not a ModelMessage field. `uiMessageToModelMessages` drops `approval`/`state`; `extractClientStateFromOriginalMessages` only restores `approval-responded`. Pending, denied, and some responded decisions can be lost across `chat()` or session resume. `@tanstack/ai-persistence` shows the official resume pattern (`resumeToolStateFromPending`) but its required ModelMessage transcript store conflicts with the chronological UI channel. This change copies that resume flow onto our session JSON.

## What Changes

- Add an explicit `approvals` table on `SessionData` covering pending, approved, and denied (with reason).
- Write the table from `respondToToolApproval` and auto-approve paths; persist and restore with the session.
- Add chat middleware that, on `onConfig`, translates the table into `resumeToolState.approvals` (shallow-merge; does not fight compaction `messages`).
- Do **not** add `@tanstack/ai-persistence`. Do not treat tool-call `state` as the resume SoT.
- **Out of scope:** unidirectional engine/channel pipeline (`unidirectional-message-pipeline`); replacing `chat()` with `chatStream`.

## Capabilities

### New Capabilities

- `tool-approval-resume`: Session-backed approval records translated to TanStack `resumeToolState` on each `chat()` config, following the `withPersistence` resume pattern without that package.

### Modified Capabilities

- `session-store`: Persist `approvals` with the session file; older files omit the field.
- `session-resume`: Restore `approvals` with `uiMessages` so the next pump can rebuild `resumeToolState`.

## Impact

- `@my-agent/core`: `SessionData` / persistence types, `SessionService`, `AgentChatController` / `ManagedAgent` approval responses, new helper + middleware, run-agent middleware list, validates.
- Session files gain an optional `approvals` array. No requirement to migrate old files; missing table means empty.
- Hosts unchanged except that resume continues to wait on pending approvals as today, with decisions surviving restart.
