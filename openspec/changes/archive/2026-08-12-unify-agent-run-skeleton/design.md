## Context

Today:

```
MAIN:  initChat → AgentChatController.pump → executeStream → runAgentStream → channel.consumeRun
         └─ applyRunOutcome(path: "chat") + session persist

SUB:   spawnSubagent → runSubagent → runAgent → consume (UI | headless)
         └─ applyRunOutcome(path: "detached")
```

Inner loop is already shared (`executeManagedAgentRun` / `AgentRunner` + middleware). Duplication lives in:

1. Stream consume (chat `channel.consumeRun` vs `consumeSubagentStream` / `consumeStreamToMessages`)
2. UI channel attach (`ensureUIChannel` in `run-agent` vs ad-hoc in `runSubagent`)
3. Half-used `runManagedAgent({ bridgeUI })` bridge path overlapping subagent consume
4. Narrative asymmetry in docs (looks like two unrelated systems)

Constraints:

- **No product/behavior change** this change (task tool, headless compact/memory, chat queues/approvals/persist stay).
- Host API remains **AgentSession**; domain `.on` stays internal.
- Prefer delete/fold over compatibility shims for obsolete internals.
- Leave seams for later interactive subagents and multi-root agents without building those products now.

Related prior work: `add-agent-session-api` (host surface), `implement-subagent`, observe removal (Session-only hosts).

## Goals / Non-Goals

**Goals:**

1. One shared **single-run skeleton** for “one LLM/tool phase stream”: attach UI (optional) → run stream → consume → apply outcome with explicit `path`.
2. Keep **InteractiveChat** and **Worker** as thin profiles over that skeleton.
3. Delete redundant consume / bridge paths once callers use the skeleton.
4. Document extension points so interactive worker sessions and multiple root sessions can land later without another rewrite.
5. Keep complexity low — small helpers, not a new framework.

**Non-Goals:**

- Interactive subagent chat (`initChat` on every sub) or steer/approval inside workers
- Multi-root agent product UX / registry redesign beyond noting Session-per-agent already works
- Changing tool sets, abort isolation, memory/compaction semantics, SessionStore rules
- Message incremental/patch protocol
- Wiring `dispatch({ type: "compact" })` or HTTP remote chat bind
- Merging ExtensionEventBus into Session

## Decisions

### D1 — Shared skeleton, not one mega-controller

**Choice:** Extract something like `runAgentOnce` / `consumeAgentStream` (exact names TBD in impl) that both `AgentChatController.executeStream` and `runSubagent` call.

```
runAgentOnce({
  managed, manager, messages,
  consume: "ui" | "headless",
  outcomePath: "chat" | "detached",
  // optional: parentTaskToolCallId, streamingAgentId, onMessagesUpdate
})
```

Chat pump remains outside and may call the skeleton many times per user turn. Worker calls it once.

**Alternatives rejected:**

- Force all subagents through `AgentChatController` — pulls queues/approvals/persist into workers or needs a huge “headless chat” mode.
- Only document the asymmetry — does not remove duplication or create seams.

### D2 — Profiles encode must-keep differences

| Concern | InteractiveChat | Worker |
|---------|-----------------|--------|
| Outer loop | `pumpToolPhases` + queues | Single `runAgentOnce` |
| Outcome path | `"chat"` | `"detached"` |
| UI | Always via chat-owned `AgentUIChannel` | `bridgeUI` ? ui : headless |
| Tools / spawn | Full root tool set | Sub tools / custom / empty |
| Persist | Session sync / uiMessages | No SessionStore |
| Session commands | Full chat surface | Typically `stop` (+ read) |
| Abort | Chat stop + incomplete tools | Isolated abort (task tool) |

Profiles are **code organization + docs**, not a heavyweight strategy framework (no plugin registry required).

### D3 — Unify consume; fold dead bridge

**Choice:** One consume helper:

- `"ui"` → `AgentUIChannel.consumeRun` (optional `onUpdate` for `subagent:ui-update`)
- `"headless"` → existing `consumeStreamToMessages` (or equivalent)

`ensureUIChannel(managed)` becomes the sole attach path for UI runs.

Remove or internalize unused/overlapping `runManagedAgent({ bridgeUI })` once no callers need the yield-through bridge.

### D4 — Future seams without building the future

Document (ARCHITECTURE + this design) only:

1. **Interactive worker later:** optional `initChat` / InteractiveChat profile on a child `ManagedAgent` when product wants steer/approvals — still one Session id per agent.
2. **Multi-root later:** AgentManager already holds many agents; each root gets its own `AgentSession`. Skeleton must not assume a singleton “the” chat controller beyond the ManagedAgent instance it is given.
3. Do **not** add abstractions now for (1)/(2) beyond “skeleton takes managed+manager; profiles decide outer loop.”

### D5 — Validation & docs over new public APIs

**Choice:** Prefer package-internal helpers + `validate:*` scripts asserting:

- Chat path still uses skeleton (smoke / structural)
- Worker bridgeUI and headless both go through consume helper
- Outcome path remains `"chat"` vs `"detached"` as today

No new host-facing export required unless a clean curated name emerges; default keep internals on `dev.ts` validates.

### D6 — Breaking internals OK

Delete duplicate helpers without deprecation periods. App must keep working via unchanged Session + chat behavior; if a private import breaks, update in-repo callers only.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Accidental behavior drift (status ghosts, task panel, persist timing) | Keep outcome path + pump logic outside skeleton; add/extend validates for detached vs chat; manual smoke: task tool + /compact path |
| Over-abstraction (“RunSessionFramework”) | Cap at consume + once-run helpers; no profile registry |
| Chat pump still large | Acceptable; this change only extracts the per-stream core |
| Future interactive sub needs more than skeleton | Document seam; do not initChat on workers now |

## Migration Plan

1. Land consume helper; point chat + subagent at it (behavior-identical).
2. Land `runAgentOnce` (or equivalent); migrate `executeStream` + `executeSubagentRun` core.
3. Delete dead bridge / duplicate consume wrappers.
4. Update ARCHITECTURE/AGENTS diagrams; add/adjust validates.
5. Rollback = revert PR; no data migration.

## Open Questions

- Exact module path/name (`managers/run-agent-once.ts` vs under `agent/run/`) — decide at apply time by file-size / import direction.
- Whether `finalizeManagedAgentRun` no-ops for workers should be short-circuited in the same PR if cheap; otherwise defer (behavior unchanged either way).
