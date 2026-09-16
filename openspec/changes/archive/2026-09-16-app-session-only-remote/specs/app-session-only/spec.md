## ADDED Requirements

### Requirement: App holds Session not ManagedAgent
`@my-agent/app` runtime hooks, layout, and slash commands SHALL NOT import or hold `ManagedAgent`, `agentManager`, live `TodoManager`, or live `AgentLog` instances. Agent observation and control MUST go through `AgentSession` / `AgentSessionHost`.

#### Scenario: useAgent store
- **WHEN** an agent is initialized
- **THEN** the app store SHALL expose the active `AgentSession` (and Host if needed)
- **AND** SHALL NOT require a `ManagedAgent` field for UI operation

#### Scenario: Slash commands
- **WHEN** the user runs `/compact`, `/plan`, `/mcp`, `/clear`, `/resume`, `/rename`, or `/auto`
- **THEN** the command handler SHALL use Session dispatch and/or Host catalog APIs only

### Requirement: Adapter bootstrap is Session-oriented
`AgentAdapter.initialize` / shared create helpers SHALL return `{ session, host?, initialMessages? }` (or equivalent) and MUST NOT require callers to receive a ManagedAgent.

#### Scenario: Local bootstrap
- **WHEN** the CLI starts without `--remote-session`
- **THEN** the host process SHALL create a Local AgentSessionHost, create a session, and pass that session into the app

#### Scenario: Remote bootstrap
- **WHEN** the CLI starts with `--remote-session <url>`
- **THEN** the UI process SHALL create a Remote AgentSessionHost against that URL and MUST NOT call `agentManager.createManagedAgent` in the UI process

### Requirement: Allowed residual core imports
The app MAY import serializable types and pure presentation helpers from core (or a future session-types package), and MAY use CoreEnv for workspace UI. The app MUST NOT import agent runtime control APIs (`agentManager`, `createManagedAgent`, compaction executors, side-LLM runners that need ManagedAgent).

#### Scenario: Lint or documented allowlist
- **WHEN** the change is complete
- **THEN** documentation SHALL list the allowed `@my-agent/core` import allowlist for app
- **AND** a validate script or lint check SHOULD fail on forbidden runtime imports

### Requirement: CoreEnv remains optional for agent control
Agent chat and session control SHALL work when the app uses only Session; CoreEnv registration in the UI process is required only for local workspace panels, not for Session dispatch.

#### Scenario: Remote agent with remote CoreEnv
- **WHEN** UI uses HTTP Session and remote CoreEnv
- **THEN** chat SHALL function via Session and file tools SHALL execute on the CoreEnv server without the UI holding ManagedAgent
