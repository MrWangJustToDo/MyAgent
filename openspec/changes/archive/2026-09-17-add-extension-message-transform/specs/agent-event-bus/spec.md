# agent-event-bus

Delta for the extension-facing API surface: the bus remains the only *event* mechanism, while the new
message-transform registration is declared as a deliberately non-bus extension surface.

## MODIFIED Requirements

### Requirement: Extension API backed by the unified bus

The extension-facing API SHALL keep its existing hook names and its existing `ctx` members (`registerInterceptor`, `events`, `ui`) while being backed by `AgentEventBus`. Interceptor registration MUST return a disposer that unregisters on extension teardown. Additive `ExtensionContext` members that are not event subscriptions MAY exist; each such member MUST be explicitly declared as a non-bus surface and MUST NOT be expressed as a third dispatch mode, an interceptor pattern name, or a parallel notification mechanism.

#### Scenario: Hook names unchanged

- **WHEN** an extension registers an interceptor for `tool:before:run_command`
- **THEN** it is invoked on the unified bus using the same hook name contract as before

#### Scenario: Teardown unregisters interceptors

- **WHEN** an extension is disabled or torn down
- **THEN** its registered interceptors and extension-UI state no longer affect the bus

#### Scenario: Additive non-bus member is not a notification mechanism

- **WHEN** a consumer inspects the extension context surface
- **THEN** any member that is not an event subscription is documented as a registration or projection API rather than as a dispatch mode, and the bus still exposes exactly `emit` and `intercept`

## ADDED Requirements

### Requirement: Non-bus extension surfaces are explicitly declared

`@my-agent/core` SHALL enumerate the extension-facing members that are deliberately not routed through `AgentEventBus`, and SHALL state for each why the bus dispatch modes are unsuitable. The enumeration MUST be part of the architecture documentation so the "single unified event bus" contract is not read as "every extension capability is an event".

#### Scenario: Enumeration exists in architecture docs

- **WHEN** a reader looks up the extension interception section of `packages/core/ARCHITECTURE.md`
- **THEN** it lists the bus-backed interceptor hook names separately from the non-bus registration APIs, and none of the latter appear in the interceptor pattern list

#### Scenario: Message transform is classified as a non-bus surface

- **WHEN** a reader looks up `registerMessageTransformer`
- **THEN** the documentation states that it is asynchronous, ordered, and returns a replacement value — properties that the shared-mutable-event/cancel-short-circuit interceptor shape does not provide — and that it is therefore not an interceptor
