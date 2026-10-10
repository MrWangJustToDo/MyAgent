## ADDED Requirements

### Requirement: ManagedAgent is the only agent runtime object

`AgentManager` SHALL hold exactly one runtime object per agent, a `ManagedAgent`, and SHALL NOT
construct a second agent object to represent the same agent. `createManagedAgent()` SHALL build the
`ManagedAgent` directly (via `buildManagedAgent`) and register it; there SHALL be no `Agent`, `Base`,
or `AgentLoopHost` class in core, and no `ManagedAgent.agent` field pointing at one. Host-facing
code SHALL therefore type an agent handle as `ManagedAgent` (or a structural subset of it), not as a
separate "agent" interface.

This is the invariant, not a file layout: the predecessor design had `Agent` + `Base` holding
session / memory / compaction / hooks / MCP / skills / abort logic while `ManagedAgent` duplicated
`context`, `status` and service access for the same agent, and `AgentLoopHost` existed only to wire
`MemoryService` / `SessionService` back to `Agent`. Restoring any of those returns core to two
objects that both claim to be "the agent".

#### Scenario: Building an agent

- **WHEN** `AgentManager.createManagedAgent()` is called
- **THEN** the returned value is a `ManagedAgent`, registered under its own id, and no second agent instance is created or attached

#### Scenario: Auditing for the removed classes

- **WHEN** core is searched for `class Agent`, `class Base`, `interface AgentLoopHost`, `extends Base`, `attachManagedState`, or a `ManagedAgent.agent` field
- **THEN** there are zero matches

#### Scenario: Host code types an agent

- **WHEN** `packages/app`, `packages/cli`, or `packages/extension` refers to an agent instance
- **THEN** it uses `ManagedAgent` (directly or via a structural subset), with no `Agent` type alias exported from core

### Requirement: Services receive an explicit dependency surface

`MemoryService` and `SessionService` SHALL be constructed with explicit dependencies, and SHALL NOT
receive a host object whose only purpose is to reach back to the owning agent (the former
`AgentLoopHost` indirection: a `getAgent()`-shaped back-reference used to call back into the agent
that owns the service). A service SHALL read what it needs from its constructor argument rather than
traversing an agent to find it.

#### Scenario: Constructing a service

- **WHEN** `MemoryService` or `SessionService` is constructed
- **THEN** its dependencies arrive as an explicit object, and no `AgentLoopHost` interface exists for it to consume

#### Scenario: Auditing for the back-reference

- **WHEN** core is searched for `AgentLoopHost`
- **THEN** there are zero matches
