## Context

`@my-agent/core` already has a coherent run pipeline (`AgentChatController` → `prepareForRun` → TanStack middleware → `finalizeRun`) and a single lifecycle bus (`AgentEventBus`) with an Event→Log bridge. Observation is still messy:

- Hosts must wire multiple channels (`agentManager.on`, `subscribeState`, `AgentUIChannel`, streaming callbacks, `AgentLog`).
- Lifecycle emits have bugs/inconsistencies (tool completion gated on `ExtensionRunner`; reactive compact also emitting `compaction:auto-start`).
- Typed events `session:restore` / `subagent:destroyed` are never emitted.
- `ARCHITECTURE.md` still documents `HookRegistry` / `hooks-middleware` / EventBus→hook script bridging, which no longer exist (superseded by `add-extension-api`).

This change fixes the lifecycle protocol and docs without merging the observation channels into one API.

## Goals / Non-Goals

**Goals:**

- Make AgentEventBus emissions complete, correctly named, and payload-aligned with Event→Log.
- Document a clear L1–L4 observation model so future work does not re-mix interception with notification.
- Keep ExtensionEventBus as the only intercept/transform path.
- Bring `packages/core/ARCHITECTURE.md` in sync with `buildAgentRunner` and extension middleware.

**Non-Goals:**

- Host-facing `managed.observe()` facade (follow-up).
- Splitting `ManagedAgent` purely for the 400-line rule.
- Unifying streaming callbacks into `AgentUIChannel`.
- Changing tool approval block/resume ownership (still TanStack + app).
- Reintroducing `.agent-hooks` as a first-class core concept (owned by extension change).

## Decisions

### D1 — Keep two buses; fix emission ownership

**Decision:** Retain `AgentEventBus` (notify-only) and `ExtensionEventBus` (interceptable). Lifecycle tool events always emit on AgentEventBus; extension bus runs after (before for deny/transform) and never gates lifecycle emit.

**Alternatives considered:**

- Merge buses → rejected; intercept semantics (skip/transform) do not belong on a fire-and-forget log bus.
- Move tool events only into ExtensionEventBus → rejected; Event→Log and app telemetry need them without loading extensions.

### D2 — Observation layers (documentation + code comments)

```
L1 Control plane   AgentStatusController + subscribeState
L2 Lifecycle bus   AgentEventBus → Event→Log (+ host on())
L3 Data plane      AgentUIChannel + streaming callbacks
L4 Interception    ExtensionEventBus only
```

**Decision:** Encode this in ARCHITECTURE.md §8; do not add a new runtime facade yet.

### D3 — Compaction start kind

**Decision:** Change `beginCompaction(kind: "auto" | "reactive" = "auto")` so it emits `compaction:auto-start` or `compaction:reactive-start` (reactive path already emits reactive-start before calling begin — prefer: beginCompaction owns the single start emit; `handleReactiveCompact` stops duplicating).

Preferred flow:

```
handleReactiveCompact:
  canRetry? else emit reactive-max-retries
  recordRetry
  beginCompaction("reactive")   // status=compacting + emit reactive-start only
  ...
  endCompaction()
```

Auto path in compaction middleware keeps `beginCompaction("auto")` / complete / error as today.

### D4 — Dead events: emit, don’t delete (this change)

**Decision:** Emit `session:restore` from `ManagedAgent.restoreSession` after successful restore; emit `subagent:destroyed` from agent destroy / autoDestroy paths when a subagent is removed.

**Rationale:** Types and log rules already exist; emit is cheaper than deleting and re-adding later for UI/telemetry.

**Alternative:** Delete both → deferred if emit sites prove awkward; prefer emit first.

### D5 — Approval logging via bridge only

**Decision:** Remove direct `log.approval(...)` from `AgentStatusController.syncApprovals`; emit `agent:tool-approval-request` only and let Event→Log format the entry.

### D6 — Subagent completed payload

**Decision:** Emit `{ subagentId, summary }` (and keep `output` as alias only if needed for app). Update Event→Log to read `summary` primarily. Align `run-subagent.ts` with bridge and any app listeners that read `output` (grep and update or dual-field for one release).

### D7 — Doc sync as a first-class deliverable

**Decision:** Update ARCHITECTURE.md in the same change: completion table, bootstrap step 10, middleware stack, §4 hooks vs approval, §8 event system, layer diagram. Reference ExtensionRunner instead of HookRegistry.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| App code depends on missing `tool-end` (none today) suddenly seeing more events | Grep app listeners; Event→Log volume increases slightly — acceptable |
| Dual-field `summary`/`output` during transition | Prefer single `summary`; update app if it reads `output` |
| Overlap with `add-extension-api` still in progress | Do not touch ExtensionAPI surface; only fix lifecycle emit next to extensions-middleware |
| Doc drift again | Point ARCHITECTURE §3.3 at `buildAgentRunner` order as source of truth |

## Migration Plan

1. Land code fixes + validation scripts in `@my-agent/core`.
2. Update ARCHITECTURE.md in the same PR.
3. No host API version bump; behavior is additive/corrective.
4. Rollback: revert PR; no persistence schema change.

## Open Questions

- None blocking. Optional follow-up: whether `llm:request`/`llm:response` should be renamed to `llm:iteration-*` (defer; document current meaning instead).
