## ADDED Requirements

### Requirement: ManagedAgent is the unit of agent management

The system SHALL represent every agent (root or subagent) as a `ManagedAgent` record owned by `AgentManager`.

#### Scenario: ManagedAgent fields

- **WHEN** an agent is created via `AgentManager.createManagedAgent()`
- **THEN** the resulting `ManagedAgent` SHALL include: `id`, `name`, `status`, `context`, `session`, `memory`, `usage`, `ui`, `runner`, `tools`, `log`, `parentId`, `childIds`, `createdAt`, `updatedAt`
- **AND** main chat message state is owned by `useChat` (via `localConnect`), while `ui` is used for subagent preview and auxiliary consumers

#### Scenario: All access through AgentManager

- **WHEN** external code needs to run, destroy, or query an agent
- **THEN** it SHALL go through `AgentManager` methods
- **AND** direct construction of `AgentRunner` outside the manager is not part of the public API

### Requirement: Status lives on ManagedAgent

The system SHALL store agent run status on `ManagedAgent.status`, not on `AgentRunner`.

#### Scenario: Status transitions on run

- **WHEN** `AgentManager.runAgent()` starts
- **THEN** `ManagedAgent.status` is set to an active status (e.g. `running`)
- **AND** when the run completes or aborts, status returns to `idle` or `aborted`

#### Scenario: ManagedAgent status is not proxied from runner

- **WHEN** code reads `managed.status`
- **THEN** the value reflects `ManagedAgent`'s own field
- **AND** it does not read from `AgentRunner`

### Requirement: Session and memory live on ManagedAgent

The system SHALL compose `SessionService` and `MemoryService` on `ManagedAgent`, not on the loop runner.

#### Scenario: Session save after run

- **WHEN** a managed agent run completes
- **THEN** `ManagedAgent.session` persists conversation state
- **AND** the runner itself does not call session store APIs

#### Scenario: Memory prefetch before run

- **WHEN** a managed agent run starts and memory is enabled
- **THEN** `ManagedAgent.memory` may prefetch relevant memories
- **AND** injected context is passed into runner configuration or middleware

### Requirement: Usage tracking lives on ManagedAgent

The system SHALL track token usage on `ManagedAgent.usage`, populated from `RUN_FINISHED` events.

#### Scenario: Usage accumulated per run

- **WHEN** a run emits `RUN_FINISHED` with usage data
- **THEN** `ManagedAgent.usage` records the delta for that run
- **AND** `AgentContext` pricing metadata is used for cost calculation when available

### Requirement: Parent-child relationships on ManagedAgent

The system SHALL track `parentId` and `childIds` on `ManagedAgent` for subagent team support.

#### Scenario: Subagent linked to parent

- **WHEN** a subagent is spawned via the `task` tool
- **THEN** the child `ManagedAgent.parentId` references the parent
- **AND** the parent `ManagedAgent.childIds` includes the child id

### Requirement: Events and hooks are not on the runner

The system SHALL dispatch lifecycle events and hook scripts from `AgentManager` (event bus + middleware), not from `AgentRunner`.

#### Scenario: Tool hook execution

- **WHEN** a tool is about to execute
- **THEN** `HooksMiddleware.onBeforeToolCall` invokes matching hook scripts via `AgentManager`
- **AND** `AgentRunner` does not reference `HookRegistry` directly
