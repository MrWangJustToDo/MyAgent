## Why

`@my-agent/app` still imports and holds `ManagedAgent`, `agentManager`, CoreEnv, and many core helpers, so the UI cannot run against a remote agent process. Workspace (CoreEnv) and model provider planes are already orthogonal; the agent control plane must become a complete, networkable Session API so the app depends only on Session (+ thin shared types), locally or over HTTP.

## What Changes

- Expand `AgentSession` so every app-facing agent operation (chat, plan, compact, clear/new session, resume/list, MCP/extension summaries, subagent directory, mode/duration, approvals, rename) goes through `getSnapshot` / `dispatch` / `subscribe` (and a small session factory/catalog surface).
- **BREAKING (app):** Remove `ManagedAgent` / `agentManager` / live `TodoManager` / `AgentLog` object holds from app hooks and commands; adapters return/bind `AgentSession` only.
- **Unify internal AgentEvent envelope:** replace loosely typed `data?: Record<string, unknown>` with a shared serializable envelope (`ts`, `agentId`, `parentId?`, typed `payload` per `type`) so Session `lifecycle` and HTTP/SSE stay stable; keep Domain Emitters and AgentEventBus as separate layers (projection, not collapse).
- Complete HTTP Session parity with Local (including `tool` / `summary` remount, child sessions, create/list/destroy).
- Wire CLI/extension/playground to choose Local vs Remote Session (`--agent-remote` / `AGENT_REMOTE`) without importing core runtime into the UI layer.
- Keep CoreEnv and ModelProvider as separate planes; app may still talk to CoreEnv for workspace panels, but not for agent loop control.
- Pure presentation helpers (`getToUI`, compaction message formatters, model defaults) either move into app or become a small `@my-agent/session-types` / session-safe export surface — not `ManagedAgent` APIs.

## Capabilities

### New Capabilities

- `session-host-api`: Complete host-facing Session contract (snapshot fields, commands, channels, session catalog) sufficient for app without ManagedAgent
- `session-http-parity`: HTTP/SSE Session client/server parity with Local (create, child ids, tool/summary remount, catalog)
- `app-session-only`: App adapter/hooks/commands consume only Session (+ shared types); remote-capable bootstrap
- `agent-event-envelope`: Typed AgentEvent payloads + shared envelope aligned with Session lifecycle wire format

### Modified Capabilities

- `agent-lifecycle-events`: Emission contracts stay; payload shape becomes typed/envelope-based instead of open `data` bags

## Impact

| Area | Change |
|------|--------|
| `@my-agent/core` | Extend Session types, Local dispatch/snapshot; session catalog; typed AgentEvent envelope; stop exporting ManagedAgent as app dependency |
| `@my-agent/server` | Harden `/api/agent/*`; catalog routes; HTTP client remount for tool/summary; lifecycle SSE carries typed payloads |
| `@my-agent/app` | **BREAKING** Session-only hooks/commands; adapter binds Session; optional remote URL |
| CLI / Extension / Playground | Register CoreEnv + Provider; create Local or Remote Session; no ManagedAgent in UI |
| Event→Log / extensions | Consume typed AgentEvent payloads (bridge rules unchanged) |
| Docs / validates | Session-only app smoke; HTTP parity; event envelope round-trip; remote agent + local/remote CoreEnv matrix |
