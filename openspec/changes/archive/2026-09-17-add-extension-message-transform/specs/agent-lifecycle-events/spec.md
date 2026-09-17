# agent-lifecycle-events

Delta for the documentation contract: the extension observation model described in ARCHITECTURE.md must
include the message-transform surface, not only the bus-backed interceptors.

## MODIFIED Requirements

### Requirement: Architecture docs describe extension observation model

`packages/core/ARCHITECTURE.md` SHALL describe the current middleware stack (`extensions-middleware`), SHALL NOT document `.agent-hooks` / HookRegistry as supported customization, SHALL document the unified `AgentEventBus` model (single registry with observer `emit` and interceptor `intercept` dispatch modes, retained values, scoped routing, and the `AgentSession` channel projection) instead of the former dual-bus split, and SHALL document the extension message-transform surface (`registerMessageTransformer`) as a non-bus capability alongside the bus-backed interceptors.

#### Scenario: Doc middleware list matches buildAgentRunner

- **WHEN** a reader follows ARCHITECTURE §3.3 middleware order
- **THEN** the listed stack matches `buildAgentRunner` in `run-agent.ts`, ending with extensions middleware rather than hooks middleware

#### Scenario: Doc describes the unified bus

- **WHEN** a reader follows the ARCHITECTURE event-model section
- **THEN** it documents one `AgentEventBus` with observer and interceptor modes and the session channel projection, and does not describe `AgentTelemetryBus` and `ExtensionEventBus` as separate systems

#### Scenario: Doc separates bus-backed from non-bus extension surfaces

- **WHEN** a reader follows the extension interception section
- **THEN** the interceptor pattern list contains only bus-backed hook names, and the message-transform registration is described in its own right with its ordering, wire-only, and cache-bypass contracts
