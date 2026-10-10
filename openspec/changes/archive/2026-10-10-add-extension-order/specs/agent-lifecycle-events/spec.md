## MODIFIED Requirements

### Requirement: Architecture docs describe extension observation model

`packages/core/ARCHITECTURE.md` SHALL describe the current middleware stack (`extensions-middleware`), SHALL NOT document `.agent-hooks` / HookRegistry as supported customization, SHALL document the unified `AgentEventBus` model (single registry with observer `emit` and interceptor `intercept` dispatch modes, retained values, scoped routing, and the `AgentSession` channel projection) instead of the former dual-bus split, SHALL document the extension message-transform surface (`registerMessageTransformer`) as a non-bus capability alongside the bus-backed interceptors, and SHALL document extension-declared dispatch order (`ExtensionAPI.order`) as the mechanism that orders the dispatch-ordered extension surfaces.

#### Scenario: Doc middleware list matches buildAgentRunner

- **WHEN** a reader follows ARCHITECTURE §3.3 middleware order
- **THEN** the listed stack matches `buildAgentRunner` in `run-agent.ts`, ending with extensions middleware rather than hooks middleware

#### Scenario: Doc describes the unified bus

- **WHEN** a reader follows the ARCHITECTURE event-model section
- **THEN** it documents one `AgentEventBus` with observer and interceptor modes and the session channel projection, and does not describe `AgentTelemetryBus` and `ExtensionEventBus` as separate systems

#### Scenario: Doc separates bus-backed from non-bus extension surfaces

- **WHEN** a reader follows the extension interception section
- **THEN** the interceptor pattern list contains only bus-backed hook names, and the message-transform registration is described in its own right with its ordering, wire-only, and cache-bypass contracts

#### Scenario: Doc states the order contract once

- **WHEN** a reader follows the ARCHITECTURE extension section to learn where an extension runs
- **THEN** it states the direction (lower first), the tie-break (load sequence), the surfaces `order` governs, and the surfaces it deliberately does not, without requiring the reader to consult a second document

## ADDED Requirements

### Requirement: Extension dispatch order is part of the loading contract

The system SHALL record each extension's load sequence at load time and SHALL make it available
alongside the extension's declared `order`, so that dispatch-ordered surfaces can be resolved to a
deterministic sequence without re-deriving load order from the loader's discovery rules. Discovery
order (which file resolves for a duplicated extension id) and dispatch order (which position the
extension runs in) SHALL remain separate concerns and MUST NOT be defined in terms of one another.

#### Scenario: Load sequence is recorded, not re-derived

- **WHEN** an extension is loaded
- **THEN** its load sequence is recorded at that moment, and dispatch ordering consumes the record rather than the loader's directory-scan order

#### Scenario: Discovery order does not decide dispatch position

- **WHEN** two extensions with the same declared `order` are discovered from different directories and loaded in a sequence
- **THEN** their dispatch position follows the recorded load sequence, and no dispatch rule reads the discovery order

### Requirement: The extension catalog reports effective dispatch order

The extension catalog SHALL carry each extension's effective dispatch order and SHALL list entries in
dispatch order, so that an ordering conflict is observable at runtime rather than only in source.
The reported value SHALL be the effective one (declared, or the default when undeclared).

#### Scenario: Catalog order matches dispatch order

- **WHEN** a consumer reads the extension catalog and separately observes interceptor dispatch
- **THEN** the catalog's entry order is consistent with the observed dispatch order

#### Scenario: Catalog exposes the effective value

- **WHEN** an extension declares no order
- **THEN** the catalog reports the effective default position rather than omitting the field
