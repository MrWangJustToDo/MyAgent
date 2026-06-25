## Why

The agent currently loses all conversation state when the process exits. Users cannot resume previous sessions, forcing them to re-explain context every time they restart. Other coding agents (Claude Code, OpenCode) support `--continue` and `--resume` flags. This feature enables session persistence and restoration for both CLI and extension.

## What Changes

- Add a **session store** in `@my-agent/core` that persists session state (UIMessages for client display, compactMessages for LLM context, model config) to a `.sessions/` directory
- Add a `convertModelMessagesToUIMessages()` utility to derive client-displayable messages from server-side ModelMessages
- Auto-save session state on each agent `onFinish` (after each interaction completes)
- Add session resume capability: restore `compactMessages` into `AgentContext` and provide `UIMessage[]` to the client
- CLI: add `--continue` / `--resume` flags and session listing
- Extension: add API endpoints for session list/load/resume

## Capabilities

### New Capabilities
- `session-store`: File-based session persistence (save/load/list/delete) with session metadata, UIMessages, compactMessages, and model config
- `model-message-converter`: Utility to convert ModelMessage[] to UIMessage[] for client display
- `session-resume`: Core resume logic that restores agent state from a persisted session

### Modified Capabilities

## Impact

- `packages/core/src/agent/` — new session store module, converter utility, integration with AgentContext
- `packages/cli/src/` — new CLI flags (`--continue`, `--resume`), session picker UI
- `packages/server/src/` — new API endpoints for session management
- `packages/extension/` — session list/resume UI components
- Removes need for separate compaction transcript JSONL files (session store subsumes this)
