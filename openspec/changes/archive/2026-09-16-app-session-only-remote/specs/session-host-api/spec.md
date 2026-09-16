## ADDED Requirements

### Requirement: Session snapshot covers app observation needs
The AgentSession snapshot SHALL include serializable fields sufficient for Footer, Debug, plan/MCP/extension panels, and subagent lists without reading ManagedAgent: at minimum `agentId`, `parentId`, `name`, `status`, `error`, `pendingApprovalCount`, `mode`, `lastStreamDurationMs`, `messages`, `queues`, `usage`, `todos`, `todosTitle`, `plan`, `autoMode`, `mcp` summary, `extensions` summary, and `subagents` summaries.

#### Scenario: Footer renders from snapshot alone
- **WHEN** the app holds only an AgentSession
- **THEN** it SHALL render model status, mode label, duration, queues, and plan progress from `getSnapshot()` and session channel events without importing ManagedAgent

### Requirement: Session commands cover app control needs
AgentSession.dispatch SHALL support all app-facing agent controls previously done via ManagedAgent / agentManager, including chat (`send`, `steer`, `followUp`, `forceSubmit`, `stop`, `clear` messages), approvals, tool-result injection, `compact`, plan enable/disable/toggle/execute/cancel/save/load/list/complete, `auto.set`, `rename`, MCP refresh, extension toggle/invoke, and session resume.

#### Scenario: Compact via dispatch
- **WHEN** the app dispatches `{ type: "compact" }`
- **THEN** the Host process SHALL run compaction and return `{ ok: true }` or a structured error
- **AND** messages/usage channels SHALL update without the app calling `autoCompact` directly

#### Scenario: Unsupported command is explicit
- **WHEN** a client dispatches an unknown or not-yet-implemented command
- **THEN** the result SHALL be `{ ok: false, code: "unsupported" | ... }` and MUST NOT throw across the HTTP boundary

### Requirement: AgentSessionHost catalog
The system SHALL provide an `AgentSessionHost` API with `create`, `connect`, `list`, and `destroy` so apps can manage sessions without `agentManager` or `SessionStore` imports.

#### Scenario: Create and list
- **WHEN** the host creates a session and later calls `list()`
- **THEN** the new session metadata SHALL appear in the list result

#### Scenario: Connect to child session
- **WHEN** a root snapshot lists a subagent id
- **THEN** `host.connect(childId)` SHALL return an AgentSession for that id with the same interface as the root

### Requirement: Channels remain authoritative for live UI
Subscribed session channels (`state`, `messages`, `queues`, `usage`, `todos`, `plan`, `tool`, `summary`, `lifecycle`, optional `log`) SHALL remain the live update path; hosts MUST NOT require ManagedAgent subscriptions. The `lifecycle` channel payload SHALL use the typed AgentEvent envelope shared with AgentEventBus.

#### Scenario: Tool streaming without ManagedAgent
- **WHEN** `run_command` emits stdout chunks
- **THEN** the app SHALL receive them on the `tool` channel of the relevant AgentSession

#### Scenario: Lifecycle matches bus envelope
- **WHEN** `agent:stop` is emitted on the AgentEventBus and projected to Session
- **THEN** the Session `lifecycle` event payload SHALL carry the same typed envelope fields (`type`, `ts`, `agentId`, `payload`)
