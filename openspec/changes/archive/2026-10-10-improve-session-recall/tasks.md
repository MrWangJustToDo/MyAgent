## 1. Session-id turn context

- [x] 1.1 Add `sessionId: "session_id"` to `TURN_CONTEXT_KINDS` (`agent/turn-context/turn-context-message.ts`)
- [x] 1.2 Add `sessionId?` to `DynamicTurnContextInput` and emit a `<session_id>` section in `buildTurnContextSections` (`managers/managed-agent-prompt.ts`)
- [x] 1.3 Pass the live session id (`getSessionData()?.id`) into the section builder each turn (`managers/managed-agent.ts`)
- [x] 1.4 Confirm subagents do not receive it (not in `SUBAGENT_ALLOWED_KINDS`)

## 2. Guidance rewrite

- [x] 2.1 Rewrite `renderStaticRetrievalBody` (`agent/turn-context/session-retrieval.ts`): drop the "current session is redundant" line; state the current session's earlier turns are on disk and reachable via `session_search` with the current session id
- [x] 2.2 Keep the body static (no counts/per-session values)

## 3. Coverage

- [x] 3.1 Update `validate-session-retrieval.mjs` for the new guidance (no "already represented" claim; names `session_search` + session id)
- [x] 3.2 Extend `validate-turn-context.mjs`: the `<session_id>` section is emitted, changes with the id, and is excluded for subagents
- [x] 3.3 Run the full core validator suite plus typecheck/lint
