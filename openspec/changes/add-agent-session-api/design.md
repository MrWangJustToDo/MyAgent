## Context

Today:

- **Workspace plane**: CoreEnv (local Node or remote HTTP) — already language-agnostic for fs/shell.
- **Agent plane**: `ManagedAgent` + `AgentChatController` — in-process only; app held live objects before Session cutover.
- Commands, todos, usage, plan, and chat control previously required direct field access alongside ad-hoc subscriptions.

Constraints from product intent:

- Same API for local direct wiring and HTTP.
- Fine-grained events (avoid coarse “everything changed”).
- Keep implementation small; breaking app APIs OK.
- Messages: full snapshots now; leave TODO for incremental later.
- Deduplicate overlapping notify paths where session channel supersedes them for hosts.

## Goals / Non-Goals

**Goals:**

1. Unify **internal** domain change notifications behind a shared Emitter base (todos, usage, status, queues, plan, messages, …).
2. One transport-agnostic `AgentSession` contract (snapshot + commands + subscribe) as the **outer** host API.
3. App consumes agent **only** through that contract (Local may still wrap ManagedAgent internally).
4. HTTP/SSE client implements the same contract for language-agnostic UIs.
5. Session channels project from the internal Emitter (+ filtered lifecycle bus); no host nudge-and-read.
6. Full `messages` arrays in snapshot/events; document TODO for deltas.
7. Subagents reuse the same `AgentSession` contract (no parallel subagent-only API).

**Non-Goals:**

- Changing run-loop / tool / compaction / memory **semantics**
- Message patch protocol implementation
- Merging ExtensionEventBus into session
- AuthZ / multi-tenant hardening (minimal agentId/sessionId only)
- Replacing remote CoreEnv or merging planes into one URL space
- Deleting AgentEventBus emit sites in v1 (lifecycle telemetry stays; Session does not require hosts to subscribe to it for UI data)

## Decisions

### D0 — Internal Emitter base (unify notify APIs first)

**Problem today:** `TodoManager.onChange(items)` carries payload; `UsageTracker` has no listeners; status uses empty `subscribeState()`; chat queues have private `notifyQueueListeners`; plan relies on `plan:*` bus then re-read; UI channel has its own subscribe. Hosts compensate with duplicate observe wiring.

**Choice:** Introduce a small typed emitter primitive in core (name TBD: `Emitter` / `TypedEventEmitter`):

```ts
class Emitter<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents & string>(type: K, listener: (payload: TEvents[K]) => void): () => void;
  protected emit<K extends keyof TEvents & string>(type: K, payload: TEvents[K]): void;
}
```

Domain objects **extend or compose** it and emit on mutation:

| Domain | Event key(s) | Payload |
|--------|--------------|---------|
| TodoManager | `change` | `TodoItem[]` |
| UsageTracker | `change` | `UsageSnapshot` (window + totals + cost) |
| Status / ManagedAgent L1 | `change` | `{ status, error, pendingApprovalCount }` |
| AgentChatController queues | `change` | `{ steer, followUp }` snapshot |
| PlanModeController | `change` | plan public state |
| AgentUIChannel | `messages` | `UIMessage[]` |
| AgentLog | `entry` | `LogEntry` |
| Streaming registry (optional wrap) | `chunk` / `clear` | existing chunk types |

**Rules:**

- Mutation paths call `emit` (or a thin `notifyX` that emits) — single notify style across internals.
- Prefer **payload-carrying** `change` / `entry` events over empty nudges.
- Thin compatibility shims OK briefly (`onChange(cb)` → `on("change", cb)`; `onLog(cb)` → `on("entry", cb)`).
- **AgentEventBus** stays for cross-cutting lifecycle telemetry (`agent:stop`, `subagent:*`, compaction, …). Event→Log bridge keeps writing into `AgentLog`; the log Emitter then notifies subscribers — do not duplicate log lines by also projecting every bus event into a Session `log` channel by default.
- This layer is **package-internal** (or curated for advanced use); hosts use AgentSession.
- **Log vs lifecycle:** `AgentLog` is the structured debug/audit stream; `lifecycle` is typed agent events. Unifying the *notify mechanism* does not merge their schemas.

```
┌─────────────────────────────────────────┐
│ AgentSession (outer: Local / HTTP)      │
│  getSnapshot / dispatch / subscribe     │
└──────────────────┬──────────────────────┘
                   │ project / fan-in
┌──────────────────▼──────────────────────┐
│ Domain Emitters (internal)              │
│  todos · usage · state · queues · plan  │
│  messages · streaming                   │
├─────────────────────────────────────────┤
│ AgentEventBus (lifecycle telemetry)     │
└──────────────────┬──────────────────────┘
                   │ unchanged semantics
┌──────────────────▼──────────────────────┐
│ ManagedAgent / run loop / tools         │
└─────────────────────────────────────────┘
```

### D1 — Package layout: types in core, HTTP beside server

**Choice:** Put protocol types + `LocalAgentSession` in `@my-agent/core` under `session-api/` (or `agent-session/`). Put HTTP routes + `HttpAgentSessionClient` in `@my-agent/server` (new `/api/agent/*` alongside existing CoreEnv routes) **or** a thin `@my-agent/agent-server` if server package coupling hurts — default **extend `@my-agent/server`** to avoid a new package.

**Alternatives:** New `@my-agent/protocol` package — cleaner long-term but more churn; defer unless exports get messy.

### D2 — `AgentSession` surface (minimal)

```ts
interface AgentSession {
  readonly id: string;
  getSnapshot(): AgentSessionSnapshot;
  dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult>;
  subscribe(handler: AgentSessionSubscriber, options?: { channels?: AgentSessionChannel[] }): () => void;
  close?(): Promise<void>;
}
```

- **Local**: wraps one `ManagedAgent` (+ chat controller when present). Same factory wraps root agents and subagents.
- **HTTP client**: REST for `dispatch`/`getSnapshot`, SSE for `subscribe`.

App `AdapterProvider` / `createAgentFromConfig` returns or registers an `AgentSession` instead of stuffing `ManagedAgent` into `useAgent`.

### D3 — Snapshot shape

Include: `agentId`, `parentId?`, `status`, `error`, `pendingApprovalCount`, `messages` (full UIMessage[]), `queues`, `usage`, `todos`, `plan`, `autoApprove`, `subagents[]` (summary only: id, status, description/parentTaskId).

**TODO (code comment + ARCHITECTURE):** `messages` incremental / JSON patch — not in this change.

### D3b — Subagents reuse AgentSession

**Choice:** Every managed agent — root or subagent — is addressed as `AgentSession` with the same snapshot/command/subscribe shape.

- Parent snapshot’s `subagents[]` is a **directory** (ids + status), updated via parent `lifecycle` (`subagent:*`) and/or a lightweight `subagents` refresh on those events.
- Task panel / subagent preview opens **`sessionFor(subagentId)`** (Local: `createLocalAgentSession(child)`; HTTP: same `/api/agent/:id/*` with the child id) and subscribes to that child’s `messages` / `state` / `streaming` / `usage` as needed.
- Subagent command surface may be a subset in practice (often read-only preview + stop); the **type** stays `AgentSession` — unsupported commands return typed errors, not a second interface.

**Alternatives rejected:** subagent-only DTO stream; “detail later” nested protocol different from Session.

### D4 — Commands (mirror chat + slash essentials)

Discriminated union, keep small:

| Command | Maps to |
|---------|---------|
| `send` / `steer` / `followUp` / `stop` | AgentChatController |
| `respondApproval` / `addToolResult` / `setClientToolWaiting` | chat + ManagedAgent |
| `compact` / `clear` / `rename` | ManagedAgent session helpers |
| `plan.*` / `auto.set` | planMode / autoApprove |
| `session.resume` | resume helpers |

Unknown commands → typed error result (no throw across HTTP boundary).

### D5 — Fine-grained channels (not one mega-event)

| Channel | Payload | Source (after D0) |
|---------|---------|-------------------|
| `state` | status/error/pendingApproval | status/L1 Emitter `change` |
| `messages` | full messages[] | UI Emitter `messages` |
| `queues` | steer/followUp snapshot | chat queues Emitter `change` |
| `usage` | usage snapshot | UsageTracker Emitter `change` |
| `todos` | todo list | TodoManager Emitter `change` |
| `plan` | plan public state | PlanMode Emitter `change` |
| `streaming` | chunk / clear | streaming Emitter (or registry wrap) |
| `log` (optional) | LogEntry | AgentLog Emitter `entry` |
| `lifecycle` | filtered AgentEvent | AgentEventBus (`DEFAULT_SESSION_LIFECYCLE_EVENTS`; facts covered by dedicated channels omitted) |

**Dedupe rule:** Hosts using Session MUST NOT need ManagedAgent field reads for UI data. Dedicated channels are authoritative. `lifecycle` is telemetry / approval / subagent directory — not a second path for usage/todos/plan/status payloads. `log` is opt-in (debug panel / remote console); default chat UI need not subscribe. Do not dual-deliver the same fact as both raw lifecycle and a derived log line on Session unless the host explicitly wants both channels.

Optional subscribe filter: `channels?: AgentSessionChannel[]` — omit = all (or document whether `log` is excluded from default “all” — **default: exclude `log` from implicit all**, require explicit `channels: ["log"]`).

### D6 — HTTP shape (same semantics)

```
GET  /api/agent/:id/snapshot
POST /api/agent/:id/command     { command }
GET  /api/agent/:id/events      SSE: event: <channel> \n data: <json>
POST /api/agent                     create/bind root session (config)
DELETE /api/agent/:id               close
```

`:id` is any managed agent id (root or subagent). SSE frames carry `{ channel, payload, ts }`. Client `subscribe` demuxes to the same handler shape as Local.

Workspace CoreEnv stays on existing `/api/fs|command|...` — **separate base path**.

### D7 — App migration strategy

1. Implement LocalAgentSession + protocol types.
2. Point `use-agent-chat`, usage/todos/plan/subagent hooks at Session.
3. **BREAKING:** remove `ManagedAgent` from `useAgent` public store (keep escape hatch only if needed for commands during transition — prefer none).
4. Add HTTP server + client; CLI flag / extension URL for remote agent session.

### D8 — Relationship to Emitter and host API

- **Emitter** = internal source of truth for domain change streams (domain `.on(...)`).
- **`LocalAgentSession.subscribe`** fans in from domain Emitters + filtered AgentEventBus → session channels.
- There is **no** host-facing `ManagedAgent.observe()` facade after Session cutover; hosts use AgentSession only.

### D9 — Simplicity over generality

- No CRDT / OT for messages.
- No OpenAPI codegen required in v1 (hand types + validate script).
- No multiplexing many agents on one SSE in v1 (one SSE per agent id).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Full message snapshots over SSE are large | Throttle; document TODO for patches; accept for v1 |
| Event double-delivery during migration | App cutover in one PR wave per host; LocalSession is sole fan-in |
| Server package grows | Keep agent routes in dedicated `routes/agent-session.ts` |
| Status drift vs applyRunOutcome | Snapshot always read from ManagedAgent after command; state channel on L1 |
| Language-agnostic clients need stable JSON | Freeze snapshot/command enums; validate round-trip script |

## Migration Plan

1. Emitter base + migrate domain notify APIs (todos/usage/state/queues/plan/messages); keep shims if needed.
2. Protocol types + LocalAgentSession fan-in from Emitters; validates.
3. Migrate app hooks to Session only.
4. HTTP routes + HttpAgentSessionClient; smoke with curl/SSE.
5. Docs: two planes; Emitter vs Session vs AgentEventBus; deprecate host use of raw ManagedAgent.
6. Rollback: revert PRs; no on-disk format change.

## Open Questions

1. **Create-session auth**: open local-only vs shared secret header — **default: no auth in v1**, document risk for bind-to-localhost.
2. **Protocol package split**: stay in core until export noise forces `@my-agent/protocol`.
3. **Subagent dispatch allowlist**: whether Local/HTTP should reject mutating commands on subagent sessions by default (typed error) or allow `stop` only — **default: allow `stop` + read paths; other mutations return typed unsupported**.
4. **Emitter inheritance vs composition**: extend `Emitter` vs hold a private emitter field — **default: composition** (`private readonly events = new Emitter<...>()`) to avoid diamond issues with existing class hierarchies; expose `on` via thin wrappers where needed.
5. **Session default channels vs log**: whether `subscribe()` with no filter includes `log` — **default: no**; hosts opt into `log` explicitly to avoid chat re-renders on every debug line.
