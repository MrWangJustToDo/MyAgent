## ADDED Requirements

### Requirement: Fine-grained session channels
AgentSession subscription SHALL support distinct channels at least for: `state`, `messages`, `queues`, `usage`, `todos`, `plan`, `streaming`, `lifecycle`, and optional `log`. A subscriber MUST be able to opt into a subset of channels so unrelated UI surfaces do not re-render on every event. When the channel filter is omitted, the default set MUST NOT include `log` unless the host explicitly lists it.

#### Scenario: Default subscribe excludes log
- **WHEN** a host calls `subscribe(handler)` with no channel filter
- **THEN** `log` channel events are not delivered until the host subscribes with `channels` including `log`

#### Scenario: Usage-only subscription
- **WHEN** a host subscribes with `channels: ["usage"]`
- **THEN** usage updates are delivered and a todos-only change does not invoke the subscriber for a todos payload

### Requirement: Dedicated channels supersede nudge-and-read
For hosts using AgentSession, updates to usage, todos, plan, messages, and status SHALL be delivered on their dedicated channels with payloads sufficient to update UI without reading `ManagedAgent` fields. Those channels SHALL be projected from the internal domain Emitter streams (see `agent-internal-emitter`). The session layer MUST NOT require a parallel empty state nudge plus direct field read for those concerns.

#### Scenario: Todos channel carries list
- **WHEN** the todo manager changes
- **THEN** the session emits a `todos` channel event whose payload includes the current todo items array

### Requirement: Lifecycle channel stays filtered
The `lifecycle` channel SHALL forward a filtered set of AgentEventBus events suitable for telemetry and subagent/approval UX (aligned with today’s default observe event set, minus concerns fully covered by dedicated channels such as raw status-only notifies). Tool start/end spam MUST NOT be required in the default lifecycle filter.

#### Scenario: Default lifecycle omits high-frequency tool chatter
- **WHEN** a host subscribes without a custom lifecycle filter
- **THEN** default delivery includes approval/subagent/stop/error class events and does not require delivering every `agent:tool-start` / `agent:tool-end` pair

### Requirement: Event deduplication for session hosts
When AgentSession is the host path, the system SHALL avoid requiring duplicate notifications for the same UI fact (for example both a generic state nudge and a dedicated usage event that forces a second ManagedAgent read). Documentation MUST state which channel is authoritative per concern.

#### Scenario: Docs name authoritative channels
- **WHEN** architecture docs describe session events
- **THEN** they identify the authoritative channel for status, messages, usage, todos, and plan
