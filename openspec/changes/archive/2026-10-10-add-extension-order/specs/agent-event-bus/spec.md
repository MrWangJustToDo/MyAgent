## MODIFIED Requirements

### Requirement: Observer and interceptor dispatch modes

`AgentEventBus` SHALL provide exactly two dispatch modes on the same registry and type declarations: `emit` (observer) and `intercept` (interceptor). Observer dispatch MUST be synchronous, ordered by registration, fire-and-forget, and MUST contain listener errors so one listener cannot starve others. Interceptor dispatch MUST be asynchronous, ordered by the declaring extension's declared dispatch order (lower first, load sequence as the tie-break), and MUST pass the same mutable event object to each interceptor so a later interceptor observes earlier mutations; each interceptor MUST be awaited; an interceptor that sets the cancel flag MUST immediately short-circuit the remaining interceptors, so the declaring order determines which interceptors a cancellation suppresses; and dispatch MUST return the final event or its replacement value.

#### Scenario: Observer listener error is contained

- **WHEN** an observer listener throws while handling an emitted event and another observer is registered for the same event
- **THEN** the second observer still receives the event

#### Scenario: Interceptor short-circuits and replaces payload

- **WHEN** an interceptor sets the cancel flag or a denying result for `tool:before:<tool>` and a later interceptor is declared for the same hook
- **THEN** the remaining interceptors are skipped and the interceptor's replacement value is returned

#### Scenario: Interceptor can await async work

- **WHEN** an interceptor returns a promise
- **THEN** the dispatch awaits it before invoking the next interceptor

#### Scenario: Later interceptor observes earlier mutation

- **WHEN** an interceptor mutates the shared event payload and does not cancel
- **THEN** the next interceptor receives the mutated event

#### Scenario: Collection uses intercept without cancellation

- **WHEN** a collect-style event such as `before_agent_start` is dispatched and every interceptor appends to the shared event without setting cancel
- **THEN** all interceptors run in declared order and the caller reads the fully collected value from the event

#### Scenario: Declared order overrides load order

- **WHEN** two extensions register an interceptor for the same hook, the one loaded later declaring a lower order than the one loaded earlier
- **THEN** the later-loaded but lower-ordered interceptor is invoked first

#### Scenario: Undeclared extensions keep their existing sequence

- **WHEN** every interceptor for a hook belongs to an extension with no declared order
- **THEN** they are invoked in load order, exactly as before declared order existed
