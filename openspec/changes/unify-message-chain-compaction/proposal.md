## Why

Conversation state is split across `AgentUIChannel`, `AgentContext` (mirrored `uiMessages` + `summaryMessage`/`compactIndex`/`runBaseline`), and ephemeral TanStack engine messages. Dual-write and headless “no channel” paths make turn-context admission, compaction, and resume harder than a single chronological chain with a wire projection. We unify on the UI channel for every LLM-bearing agent.

## What Changes

1. **Remove message dual-write** — UI channel is the only durable UIMessage store; delete `syncContextFromUIMessages` and any Context message mirror.
2. **Update compaction** — append `[CONVERSATION SUMMARY]` checkpoints to the channel; middleware projects **summary-first** wire order; remove `summaryMessage`/`compactIndex` entirely (no dual-read).
3. **Delete `AgentContext`** — relocate `runBaseline` merge onto `ManagedAgent`/helpers; **require UI channel for all LLM agents** (including subagents); remove headless no-channel consume.
4. Resume/persist = channel `uiMessages` only.
5. Transcript: show compact checkpoints; keep `<turn_context>` display-filtered.
6. **BREAKING / no compatibility layer** — drop outdated APIs; no session-field migration. Old sessions that relied on `summaryMessage`/`compactIndex`/`AgentContext` are unsupported (start fresh or abandon).

## Capabilities

### New Capabilities

- `unified-message-chain`: Channel-only message SoT; append compact + middleware summary-first; no AgentContext; LLM runs always have a UI channel; no legacy shims.

### Modified Capabilities

- `session-resume`: Hydrate channel from `uiMessages` only; continuity from in-chain summaries in that list.
- `session-store`: Persist channel `uiMessages` (+ usage/todos/etc.); **remove** `summaryMessage`/`compactIndex`/`compactMessages` from the schema—no read migration.

## Impact

- `@my-agent/core`: delete `AgentContext` and related exports; compaction; subagent; session types; middleware.
- `@my-agent/app` / CLI / extension: remove `useAgentContext` (or replace with channel snapshot only—no Context type).
- Docs + validates; **no** backwards-compat helpers kept “for a release.”
