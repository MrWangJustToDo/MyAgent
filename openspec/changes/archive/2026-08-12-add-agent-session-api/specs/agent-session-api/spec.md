## ADDED Requirements

### Requirement: Transport-agnostic AgentSession contract
The system SHALL expose a transport-agnostic `AgentSession` interface that provides snapshot read, command dispatch, and channel subscription. Local in-process and HTTP clients MUST implement the same interface shape so hosts can switch transports without changing UI consumption patterns.

#### Scenario: Local and HTTP share command names
- **WHEN** a host dispatches a `stop` command through LocalAgentSession or HttpAgentSessionClient
- **THEN** both implementations accept the same command discriminant and return a structured command result (success or typed error)

### Requirement: Snapshot includes UI-critical fields
`getSnapshot()` SHALL return a JSON-serializable snapshot that includes at least: agent id, optional parent id, status, error, pending approval count, full messages array, message queues, usage totals, todos, plan public state, auto-approve flag, and a subagents summary list (ids and status at minimum).

#### Scenario: Snapshot after idle create
- **WHEN** a LocalAgentSession is created for a managed agent that has not run
- **THEN** `getSnapshot()` returns status idle (or equivalent), an empty or initial messages array, and serializable usage/todos/plan fields

### Requirement: Subagents use the same AgentSession contract
A subagent `ManagedAgent` SHALL be exposed through the same `AgentSession` interface as the root agent (snapshot, dispatch, subscribe with the same channels). Parent snapshots MAY list child summaries only; detailed subagent messages, tool output, summary streams, and usage MUST be obtained by opening a session for the child agent id, not via a separate subagent-only protocol.

#### Scenario: Task panel opens child session
- **WHEN** the UI needs a subagent preview for child id `S`
- **THEN** it uses an `AgentSession` bound to `S` (Local or HTTP `/api/agent/S/...`) and subscribes to that session’s channels rather than reading the child `ManagedAgent` directly

#### Scenario: Parent snapshot lists children without full child messages
- **WHEN** a parent session snapshot is read while subagents exist
- **THEN** `subagents` contains summary entries for those children and does not require embedding each child’s full messages array in the parent snapshot

### Requirement: Messages are full snapshots
Message delivery via snapshot and the `messages` session channel SHALL carry the full current `UIMessage[]` for the agent UI channel. Incremental message patches are out of scope for this change but MUST be marked as a documented TODO in architecture notes.

#### Scenario: Messages channel pushes full array
- **WHEN** the UI channel emits a messages change
- **THEN** the session `messages` channel payload includes the complete messages array, not a partial patch

### Requirement: App consumes agent through AgentSession
After migration, `@my-agent/app` host hooks that drive chat, usage, todos, plan, and subagent lists SHALL obtain agent runtime data and issue control actions through `AgentSession` (or a thin store wrapping it), not by reading `ManagedAgent` / `TodoManager` / `UsageTracker` fields for those concerns.

#### Scenario: Chat send goes through dispatch
- **WHEN** the user submits a chat message in the app
- **THEN** the app invokes `session.dispatch({ type: "send", … })` (or equivalent session API) rather than calling `AgentChatController.sendMessage` directly from the hook

### Requirement: Local session wraps ManagedAgent
The LocalAgentSession implementation MAY hold a `ManagedAgent` reference internally and MUST fan-in existing controllers, observe hooks, and managers into the session contract so hosts do not need a second subscription path for the same UI data.

#### Scenario: Single unsubscribe tears down fan-in
- **WHEN** a host calls the unsubscribe function returned by `session.subscribe`
- **THEN** state, messages, queues, usage, todos, plan, tool, summary, and lifecycle listeners registered by that subscribe call are all removed
