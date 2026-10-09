## MODIFIED Requirements

### Requirement: Extension API backed by the unified bus

The extension-facing API SHALL keep its existing hook names and its existing `ctx` members (`registerInterceptor`, `events`, `ui`) while being backed by `AgentEventBus`. Interceptor registration MUST return a disposer that unregisters on extension teardown. The `events` facade SHALL also expose observer accessors (`observe` / `observeAny` / `retained`) that use the bus's existing observer dispatch mode — routing extension observation through the bus rather than through a parallel notification mechanism. Additive `ExtensionContext` members that are not event subscriptions MAY exist; each such member MUST be explicitly declared as a non-bus surface and MUST NOT be expressed as a third dispatch mode, an interceptor pattern name, or a parallel notification mechanism.

#### Scenario: Hook names unchanged
- **WHEN** an extension registers an interceptor for `tool:before:run_command`
- **THEN** it is invoked on the unified bus using the same hook name contract as before

#### Scenario: Teardown unregisters interceptors
- **WHEN** an extension is disabled or torn down
- **THEN** its registered interceptors, its observer subscriptions, and its extension-UI state no longer affect the bus

#### Scenario: Additive non-bus member is not a notification mechanism
- **WHEN** a consumer inspects the extension context surface
- **THEN** any member that is not an event subscription is documented as a registration or projection API rather than as a dispatch mode, and the bus still exposes exactly `emit` and `intercept`

#### Scenario: Observer accessors reuse observer dispatch
- **WHEN** an extension subscribes to an observer event via `ctx.events.observe`
- **THEN** the subscription is delivered by the bus's observer dispatch mode (synchronous, registration-ordered, error-isolated) and the bus still exposes exactly `emit` and `intercept`
