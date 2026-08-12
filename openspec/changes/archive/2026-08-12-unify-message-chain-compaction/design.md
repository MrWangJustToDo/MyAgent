## Context

Confirmed scope:

1. No message dual-write (channel only).
2. Compact: append on chain; middleware summary-first for the model.
3. Delete `AgentContext`; every LLM run has a UI channel.
4. **No session compatibility / no outdated API shims** — breaking is fine; abandon incompatible old sessions.

## Goals / Non-Goals

**Goals:**

- Single durable UIMessage chain: **UI channel only**.
- Compact append + middleware `[SUMMARY, kept…, after…]`.
- **Delete `AgentContext`** and its public exports/hooks as a store.
- Always attach `AgentUIChannel` for LLM agents.
- Clean session schema: `uiMessages` carries in-chain summaries; delete parallel compact fields.

**Non-Goals:**

- Migrating old sessions that stored `summaryMessage`/`compactIndex` without in-chain markers.
- Keeping deprecated APIs (`getSummaryMessage`, `getCompactIndex`, `syncContextFromUIMessages`, `AgentContext`, headless no-channel consume) even temporarily.
- Archive format changes; full OpenCode epochs.

## Decisions

### D1: No dual-write — channel is SoT

### D2: Compact append + middleware summary-first

### D3: Delete `AgentContext`; always have a channel

Relocate `runBaselineCount` to `ManagedAgent`/chat controller. Subagents always `ensureUIChannel` (`bridgeUI` only gates parent panel events).

### D4: Engine merge stays ephemeral (pure function from channel + engine)

### D5: Display — compact checkpoints visible; turn_context hidden

### D5b: Post-compact wire from channel + engine-prefer baseline

After append, TanStack `engineMessages` still match the **pre-compact** length. Preferring the engine when `engine.length === runBaselineCount` would drop the new SUMMARY on the immediate LLM call. Middleware therefore re-projects from `convertMessages(channel)` + `getModelVisibleMessages`. Because TanStack writes that projected array into the engine while the channel stays chronological, UI/engine no longer share indices — set `runBaselineCount` to `Number.MAX_SAFE_INTEGER` so later iterations take the engine-prefer path until the next `prepareForRun`. Recovery `getMessages` is a live `() => managed.ui.getMessages()` (not a pre-run snapshot).

### D6: Hard break on session / API

**Choice:** New code reads only the new shape. If a session file still has only legacy compact fields and no in-chain summary, resume does **not** reconstruct continuity—unsupported. Prefer clear failure or “treat as plain uiMessages without compact window” only if uiMessages alone are enough; **do not** implement migrate-from-`summaryMessage`.

**Remove from public surface (no aliases):** `AgentContext`, `getSummaryMessage`, `setSummaryMessage`, `getCompactIndex`, `setCompactIndex`, `syncContextFromUIMessages`, `getMessagesForLLM` as Context methods, session `summaryMessage`/`compactIndex` fields.

## Risks / Trade-offs

- **[Risk] Users lose old compacted sessions’ LLM window** → Accepted; start new session.
- **[Risk] Missed call sites** → Delete types so TypeScript fails closed.
- **[Risk] Wire≠chain** → Never write projected wire arrays back to channel.
- **[Risk] Subagent always-on channel** → OK; suppress parent UI when `bridgeUI: false`.

## Migration Plan

None for data. Implementation order: projection middleware → compact append → require channel → delete Context/APIs/session fields → docs/validate.

## Open Questions

- On resume of a file that still contains obsolete fields: ignore fields vs refuse load—**recommendation: ignore obsolete fields, use `uiMessages` as-is** (if that list already has in-chain summaries from newer builds it works; old compacted sessions without markers simply have a longer wire window until next compact).
- Remove `useAgentContext` entirely vs replace with `useAgentMessages()` from channel—**recommendation: remove Context hook; hosts use session/channel subscriptions already used for messages.**
