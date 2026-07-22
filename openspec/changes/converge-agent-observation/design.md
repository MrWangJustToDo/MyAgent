## Context

After `simplify-agent-events`, lifecycle emit is consistent and ARCHITECTURE documents L1–L4. Hosts still wire five channels independently:

| Layer | Today | Pain |
|-------|-------|------|
| L1 | `ManagedAgent.subscribeState` | Easy to miss next to bus events |
| L2 | `agentManager.on(...)` | Per-event subscriptions scattered across hooks |
| L3a | `AgentUIChannel` (often via chat controller) | Not exported as primary host API |
| L3b | Global `subscribeStreamingCallback` | Cross-agent leakage if two agents stream |
| Log | `AgentLog.subscribe` / Event→Log | Optional UI panel |

`ManagedAgent` is ~778 lines and mixes prepare/finalize, session, reactive compact, extensions, and observation.

## Goals / Non-Goals

**Goals:**

- One recommended host entry: `managed.observe(handlers)` with single teardown.
- Scope streaming emits/subscribes by `agentId` (toolCallId remains the UI key).
- Split `ManagedAgent` into focused modules without breaking public exports.
- Migrate primary `@my-agent/app` subscribers to the facade.
- Keep L4 ExtensionEventBus out of observe.
- Narrow the published host surface: no public streaming subscribe; `subscribeState` private; `agentManager.on` advanced-only for cross-agent / `"*"` telemetry.

**Non-Goals:**

- Merging AgentEventBus + ExtensionEventBus.
- Replacing TanStack approval protocol.
- Removing the lifecycle bus (Event→Log and advanced `agentManager.on` still use it).
- Moving streaming bytes into `UIMessage` parts (stay multicast chunks).

## Decisions

### D1 — `observe()` shape

```typescript
type AgentObserveHandlers = {
  onState?: () => void;                    // L1 — same as subscribeState
  onEvent?: (event: AgentEvent) => void;   // L2 — filtered to this agentId (+ optional parent fan-in)
  events?: AgentEventType[] | "*";         // default: useful UI set, not every llm:iteration
  onMessages?: (messages: UIMessage[]) => void; // L3 via ui channel when present
  onStreaming?: (chunk: StreamingChunk) => void;
  onStreamingClear?: (toolCallId: string) => void;
  onLog?: (entry: AgentLogEntry) => void;  // optional
};

managed.observe(handlers): () => void;
```

**Decision:** Return a single unsubscribe function (compose inner unsubs). Filter L2 by `event.agentId === managed.id` or `event.parentId === managed.id` when observing a parent that wants child fan-in — default **only this agentId**; subagent UIs observe the subagent instance.

**Alternatives:** Observable/async iterator → rejected (app uses sync React subscriptions). Class `AgentObservation` handle with `.stop()` → optional sugar later; function return is enough.

**Default `events`:** `prompt:submit`, `agent:stop`, `agent:abort`, `agent:stream-error`, `agent:tool-approval-request`, `subagent:*` when parent — document the set; `"*"` for full bus filter.

### D2 — Do not hide Manager bus

`observe` registers on `agentManager` (or injected bus) via the agent’s manager reference. ManagedAgent already can reach manager through run/chat paths — pass `getManager` / store weak ref at factory time if needed. Avoid importing singleton in deep modules when a callback works.

### D3 — Streaming scope

```
Map<agentId, Set<callback>>  (+ clear map)
emitStreamingChunk(toolCallId, type, chunk, { agentId })
subscribeStreamingCallback(cb, { agentId })
```

**Decision:** Require `agentId` on subscribe and emit. Tools thread `agentId` from `ToolRunContext`; task-summary streams use the parent agent id. Subscribe helpers stay package-internal; hosts use `observe({ onStreaming })`.

**Alternatives considered:** Legacy global fan-in during migration → rejected; remove immediately to avoid dual delivery paths.

### D4 — ManagedAgent split boundaries

Extract without changing method names on the class (delegate):

| Module | Responsibility |
|--------|----------------|
| `managed-agent-observe.ts` | `observe` / subscribe helpers |
| `managed-agent-session.ts` | persist / restore / sync tracker helpers |
| `managed-agent-run-lifecycle.ts` | `prepareForRun`, `finalizeRun`, abort glue |
| `managed-agent-compact.ts` | `handleReactiveCompact` |
| `managed-agent.ts` | fields, ctor, thin wrappers, public surface |

Stop splitting when each file is cohesive and ≤400 lines; do not create one-file-per-method.

### D5 — App migration order

1. `use-streaming-output` → scoped subscribe  
2. `use-agent-chat` + `Footer` → `onState`  
3. `use-agent-usage` → `onEvent` for stop/submit  
4. Subagent hooks / panel → observe subagent or parent with explicit event list  

Keep behavior identical; no UI redesign.

### D6 — Docs

Update ARCHITECTURE §8: “Recommended host path = observe”; raw channels = advanced. Link L1–L4 table to handler fields.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Missing agentId on some emit sites → dropped chunks | Validate script; default log warn once in dev |
| App double-subscribe during migration | Migrate one hook at a time; observe replaces not stacks |
| Split PRs hard to review | Land observe+streaming first, then split ManagedAgent, then app polish |
| Default event filter too narrow | Start with documented allowlist; `"*"` escape hatch |

## Migration Plan

1. Implement observe + scoped streaming in core; export; validate.  
2. Migrate app hooks.  
3. Split ManagedAgent (pure move + delegate).  
4. Docs + deprecate global streaming subscribe in JSDoc.  
5. Rollback = revert commit; no persistence schema change.

## Open Questions

- Whether parent `observe` should auto fan-in `subagent:*` for `event.parentId === id` by default — **default yes for `subagent:*` types only** when `events` includes them or is `"*"`.
