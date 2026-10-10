## Why

The context window only shows messages since the last compaction summary — earlier turns of the
CURRENT session have scrolled out. Those turns are on disk in the session log, but `session_search`
excludes the current session by default, and the `<session_retrieval>` guidance actively tells the
model that "the current session's own files are already represented by this conversation, so
re-reading them duplicates context". That statement is wrong now: the compacted-away part is not in
context, so the model has no path back to its own earlier history. The model also cannot address its
own session because it does not know its session id.

## What Changes

- Loosen the `<session_retrieval>` guidance: drop the "current session is redundant" claim and
  state that the current session's earlier (compacted-away) turns are on disk and reachable by
  calling `session_search` with the current session id.
- Add a `<session_id>` turn-context section carrying the current session's id, so the model can pass
  it to `session_search` / `session_read`. It is re-admitted when the active session changes
  (resume/restore/clear) and is absent for subagents.
- No tool-signature change: `session_search` keeps excluding the current session by default (the
  live turns would duplicate); the id makes the explicit opt-in reachable.

## Capabilities

### Modified Capabilities

- `session-retrieval`: the guidance no longer claims the current session is redundant, and the
  current session id is provided as its own turn-context section.

## Impact

- Affected code:
  - `packages/core/src/agent/turn-context/turn-context-message.ts` — new `session_id` kind
  - `packages/core/src/managers/managed-agent-prompt.ts` — emit the `<session_id>` section
  - `packages/core/src/managers/managed-agent.ts` — pass the live session id into the section builder
  - `packages/core/src/agent/turn-context/session-retrieval.ts` — guidance rewrite
  - `packages/core/scripts/` — update `validate-session-retrieval` / `validate-turn-context`
- Non-goals: changing `session_search`'s default (still excludes the current session); a time-window
  filter; subagent access to history.
