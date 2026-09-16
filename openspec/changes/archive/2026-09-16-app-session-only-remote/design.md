## Context

Three orthogonal remotes already exist:

1. **CoreEnv** — workspace fs/shell (`--remote`)
2. **ModelProvider** — LLM keys (`--remote-provider`)
3. **AgentSession** — agent control plane (`--remote-session`) — Local + Remote exist but app still holds `ManagedAgent` / `agentManager`

Prior change `add-agent-session-api` introduced Session as the outer host API. App partially adopted it for chat I/O, usage, plan banner, tool/summary streams. Gaps remain: bootstrap, slash commands (compact/clear/plan files/MCP/extensions), session catalog, subagent directory richness, HTTP remount parity, and dual stores (`useAgent.agent` + `session`).

Stakeholders: CLI, Chrome extension, playground, future non-TS UIs. Constraint: do **not** merge Session with CoreEnv or Provider; do **not** replace Session with ACP (optional adapter later).

## Goals / Non-Goals

**Goals:**

1. App runtime path uses **only** `AgentSession` (+ serializable shared types) for all agent observation and control.
2. Same Session contract works **in-process** and **over HTTP/SSE** with feature parity for remount.
3. Host bootstrap: register CoreEnv + ModelProvider; obtain Session via Local factory or Remote client; never pass `ManagedAgent` into UI.
4. Expand Session commands/snapshot so slash commands and Footer/Debug no longer escape to ManagedAgent.
5. Session **catalog** API for list/create/destroy/resume (covers today's `SessionStore` + `agentManager` create/destroy).
6. **Typed AgentEvent envelope** shared with Session `lifecycle` wire shape (serializable, no open `data` bags).

**Non-Goals:**

- ACP as the primary wire protocol
- Merging CoreEnv into Session (workspace panels may keep CoreEnv client)
- Collapsing Domain Emitters + AgentEventBus + Session into one bus
- Message incremental/patch protocol (full snapshots remain OK; document TODO)
- Multi-tenant auth hardening beyond session id
- Moving tool presentation (`getToUI`, `previewEdit`) into Session — keep as pure UI helpers in app or a types/helpers package

## Decisions

### D0 — Typed AgentEvent envelope (before / with Session expansion)

**Problem:** `AgentEvent` is `{ type, agentId, parentId?, data?: Record<string, unknown> }`. Session `lifecycle` projects that bag over HTTP; Event→Log and hosts cannot rely on fields. Domain Emitters already use typed payloads (`change` → T).

**Choice:** Introduce a shared envelope and discriminated payloads:

```ts
interface AgentEventBase {
  ts: number;
  agentId: string;
  parentId?: string;
}

type AgentEvent =
  | (AgentEventBase & { type: "agent:tool-start"; payload: ToolStartPayload })
  | (AgentEventBase & { type: "subagent:completed"; payload: { summary: string; ... } })
  | ...;
```

Rules:

- `emitAgentEvent` / `ManagedAgent.emitEvent` take typed `(type, payload)` (or a single discriminated object).
- Session `lifecycle` channel payload **is** that same `AgentEvent` (or a thin `{ event }` wrapper) — one wire shape Local and HTTP.
- Domain Emitters stay internal (`todos.change`, `usage.change`, …); Session channels remain the host projection for UI state.
- Do **not** make app subscribe to AgentEventBus; Event→Log and extensions keep bus access.

**Alternatives considered:**

- Collapse everything into Session events only — rejected (Event→Log / middleware still need bus).
- Keep open `data` and document conventions — rejected (breaks remote Session reliability).

### D1 — Two surfaces: Session instance + SessionHost

**Choice:** Split the host API:

```ts
interface AgentSession { /* existing: snapshot / dispatch / subscribe / close */ }

interface AgentSessionHost {
  create(options: CreateSessionOptions): Promise<AgentSession>;
  connect(id: string): Promise<AgentSession>; // remote reattach / child
  list(): Promise<SessionMeta[]>;             // disk or server catalog
  destroy(id: string): Promise<void>;
}
```

- **Local:** `createLocalAgentSessionHost({ manager })` wraps `agentManager` + `SessionStore`
- **Remote:** `createRemoteSessionHost(baseUrl)` maps to `/api/agent` catalog routes

App adapter holds `AgentSessionHost` + active `AgentSession`, never `ManagedAgent`.

**Alternative considered:** Stuff catalog into Session itself — rejected; Session is per-agent instance.

### D2 — Expand snapshot + commands to cover app escapes

Add snapshot fields (serializable):

| Field | Replaces |
|-------|----------|
| `name`, `mode` (`AgentMode`), `lastStreamDurationMs` | Footer / mode cycle |
| `mcp` summary (servers + status) | `/mcp` |
| `extensions` summary (id, name, commands) | ExtensionPanel + slash sync |
| `subagents[]` richer (description, parentTaskToolCallId, status, usage?) | SubagentPanel / use-task |
| `thinkingPreview?` | optional thinking line |
| `logTail?` or rely on `log` channel | Debug |

New / complete commands:

| Command | Notes |
|---------|-------|
| `compact` | Run autoCompact path; return ok/error |
| `session.clear` | Clear messages + new disk session semantics (or `session.new` + switch) |
| `session.list` | Prefer Host.list; optional dispatch for simple clients |
| `plan.save` / `plan.load` / `plan.list` / `plan.complete` | File ops via CoreEnv on server |
| `mcp.refresh` | Resync status into snapshot |
| `extension.toggle` / `extension.invokeCommand` | Panel + slash |
| `mode.cycle` or keep plan/auto commands | Unify mode |
| `rename` | Keep; side-LLM title generation becomes Host/server-side helper behind command |

Subagent sessions: allow same command set as root where meaningful; keep stop always.

### D3 — App dependency boundary

```
@my-agent/app
  ├── AgentSession / AgentSessionHost   (runtime)
  ├── shared types only                 (AgentStatus, TodoItem, UIMessage-shaped snapshots, …)
  ├── CoreEnv client (optional)         (workspace FileTree — plane 1)
  └── NO ManagedAgent, agentManager, TodoManager instance, AgentLog instance
```

Bootstrap moves to host packages (CLI/extension):

```
registerCoreEnv(...)
registerModelProvider(...)
const host = local ? createLocalAgentSessionHost(...) : createRemoteSessionHost(url)
const session = await host.create({ model, ... })
adapter.initialize({ session, host })
```

`createAgentFromConfig` becomes Session-oriented or is replaced by Host.create.

**Types package:** Prefer keeping serializable types exported from `@my-agent/core` under a documented “session-safe” set; longer-term extract `@my-agent/session` if core import graph stays heavy. v1: lint rule / AGENTS.md allowlist rather than new package unless needed.

### D4 — HTTP parity

| Concern | Approach |
|---------|----------|
| tool / summary remount | Server stores last tool buffers + SummaryStreamHub snapshots; client caches SSE + implements `getSummaryStreamSnapshot` |
| Child sessions | `GET/POST /api/agent/:id` works for subagent ids created in-process on server |
| Catalog | `GET /api/agent` list; `POST` create; `DELETE` destroy; resume via command or `POST .../resume` |
| Auth | Deferred; trust network like provider proxy |

### D5 — Phased delivery

0. **Event envelope** — typed AgentEvent + Session lifecycle alignment + Event→Log update
1. **Session completeness (Local)** — commands/snapshot for all app escapes; LocalHost catalog
2. **App cutover** — remove ManagedAgent from hooks/commands; Local only still works
3. **Remote parity + wire `--remote-session`** — extension/CLI remote agent

Do not ship remote before Local Session-only app. Prefer envelope before relying on remote `lifecycle`.

## Risks / Trade-offs

- **[Risk] Typed event migration churn at emit sites** → Mitigation: introduce payload map + helpers; migrate hot paths first (tool/subagent/compaction/stop); temporary compat shim only inside core if needed (not on wire)
- **[Risk] Large BREAKING app refactor** → Mitigation: phase 1 Local Session completeness with dual-write, then delete ManagedAgent holds in one PR per area
- **[Risk] Fat Session snapshot** → Mitigation: channel-based updates; keep list endpoints thin; full snapshot on connect only
- **[Risk] Side LLM rename / compact need model on server** → Mitigation: those commands run on Host process (Local or agent server), not in app
- **[Risk] Extension commands need dynamic slash menu** → Mitigation: `extensions` in snapshot + `extensions` channel on change
- **[Trade-off] Pure UI helpers stay in core temporarily** → Accept until Session cutover; then move formatters into app to shrink remote attack surface
- **[Trade-off] ACP not used** → Document; optional adapter later maps Session → ACP
- **[Trade-off] Keep three event layers** → Envelope unifies *shape*; layers stay (Emitter → Bus → Session projection)

## Migration Plan

1. Typed AgentEvent envelope + Event→Log / lifecycle filter updates + validate round-trip
2. Extend core Session types + Local implementation + validates
3. Add `AgentSessionHost` Local; migrate `create-agent` / chat init
4. Migrate app hooks/commands file-by-file off ManagedAgent
5. HTTP parity + catalog routes; validate script live smoke
6. CLI `--remote-session` path; extension optional remote agent URL
7. Update AGENTS.md / ARCHITECTURE; archive when done

Rollback: keep Local Host wrapping ManagedAgent internally forever; only the app boundary is hard.

## Open Questions

1. Should workspace FileTree stay on CoreEnv forever, or mirror a read-only `workspace` channel on Session? **Default: CoreEnv forever.**
2. Extract `@my-agent/session` package in this change or after cutover? **Default: after.**
3. `/clear` = new Session via Host.create vs in-place `session.clear`? **Prefer Host.create + switch active id for cleaner remote semantics.**
