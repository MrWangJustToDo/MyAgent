## ADDED Requirements

### Requirement: Typed Emitter primitive for domain updates
The system SHALL provide a reusable typed emitter primitive (`Emitter` / equivalent) that supports typed `on(type, listener)` subscription returning an unsubscribe function and protected/internal `emit(type, payload)` for producers. Domain state holders that currently use ad-hoc listener sets or empty nudge callbacks SHALL migrate to this primitive for their change notifications.

#### Scenario: Subscribe and receive payload
- **WHEN** a listener is registered with `on("change", listener)` on a domain emitter and the producer emits `change` with a payload
- **THEN** the listener is invoked with that payload and unsubscribe stops further delivery

### Requirement: Domain objects emit on mutation
TodoManager, UsageTracker, agent L1 status surface, chat message queues, plan public state, UI message channel, and AgentLog SHALL notify subscribers through the Emitter primitive (or a thin wrapper over it) when their relevant state mutates, carrying enough payload to update consumers without a follow-up field read for that concern.

#### Scenario: Todo change carries items
- **WHEN** todos are updated
- **THEN** a `change` (or equivalent) emission includes the current todo items array

#### Scenario: Usage change carries snapshot
- **WHEN** usage totals or window usage are updated
- **THEN** a `change` emission includes a serializable usage snapshot (not an empty nudge)

#### Scenario: Log write emits entry
- **WHEN** AgentLog records a new entry
- **THEN** an `entry` (or equivalent) emission includes that `LogEntry` payload

### Requirement: AgentEventBus remains for lifecycle telemetry
Migrating domain notify paths to Emitter MUST NOT suppress AgentEventBus emissions used for Event→Log, extensions, and lifecycle telemetry. Domain Emitters and the lifecycle bus MAY share the same primitive implementation, but lifecycle event contracts remain in force independently of Session channel projection.

#### Scenario: Bus still emits agent stop
- **WHEN** a run stops after Emitter-based status/usage updates are wired
- **THEN** `agent:stop` is still emitted on the AgentEventBus for existing bus consumers

### Requirement: Session projects from Emitters
LocalAgentSession channel subscription for `state`, `messages`, `queues`, `usage`, `todos`, `plan`, and `tool` SHALL be implemented by subscribing to the corresponding domain Emitter events (plus tool-output registry if wrapped), not by requiring hosts to combine empty `subscribeState` nudges with direct ManagedAgent field reads.

#### Scenario: Usage channel from UsageTracker emitter
- **WHEN** UsageTracker emits `change`
- **THEN** LocalAgentSession delivers an `usage` channel event with the usage snapshot payload to session subscribers
