## ADDED Requirements

### Requirement: Telemetry emit APIs use telemetry naming
In-process agent bus emission APIs SHALL use names that identify them as telemetry (not Session UI channels or AgentLog).

#### Scenario: Primary emit helper
- **WHEN** runtime code publishes a bus event
- **THEN** it SHALL call `emitAgentTelemetry` (or the documented successor name)
- **AND** SHALL NOT use the former `emitAgentEvent` name on the public or internal emit entry

#### Scenario: Bus type name
- **WHEN** code refers to the in-process bus class
- **THEN** it SHALL use `AgentTelemetryBus` (or documented successor)
- **AND** Session channel `lifecycle` MAY continue to carry filtered `AgentEvent` envelopes without renaming the channel

### Requirement: Telemetry-to-log bridge naming
The bridge that writes bus telemetry into `AgentLog` SHALL be named to reflect that direction (e.g. `bridgeTelemetryToAgentLog`).

#### Scenario: Bridge attach
- **WHEN** AgentManager wires log bridging at construction
- **THEN** it SHALL use the telemetry-named bridge API
- **AND** Session `log` channel SHALL remain the projection of AgentLog entries

### Requirement: Three flows remain distinct
The system SHALL keep three distinct flows: (1) telemetry bus emit, (2) Session subscribe channels for UI, (3) AgentLog structured lines. UI MUST observe agents via Session, not by subscribing to the telemetry bus.

#### Scenario: App observation
- **WHEN** the Session-only app needs run status or tool progress
- **THEN** it SHALL use AgentSession snapshot/subscribe/dispatch
- **AND** SHALL NOT import or subscribe to `AgentTelemetryBus` for UI state
