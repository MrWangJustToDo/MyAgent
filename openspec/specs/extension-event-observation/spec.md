# extension-event-observation Specification

## Purpose
TBD - created by archiving change add-extension-event-observation. Update Purpose after archive.
## Requirements
### Requirement: Extension event observation surface

`ExtensionContext.events` SHALL expose three observer accessors in addition to its existing interceptor accessors (`on` / `off` / `emit`, unchanged):

- `observe(type, handler, options?)` — subscribe to one declared observable event, returning a disposer;
- `observeAny(handler, options?)` — subscribe to every declared observable event, returning a disposer;
- `retained(type)` — read the current retained value for a declared observable event, or `undefined`.

Handlers receive the same typed `AgentEvent` envelope the bus delivers. Observation SHALL use the bus's existing observer dispatch mode and MUST NOT introduce a third dispatch mode.

#### Scenario: Extension observes a telemetry event

- **WHEN** an extension calls `ctx.events.observe("llm:response", handler)`
- **THEN** `handler` is invoked with the `llm:response` event envelope each time the agent emits it, and the call returns a disposer

#### Scenario: Observer accessor does not replace the interceptor accessor

- **WHEN** an extension registers `ctx.events.on("tool:before:run_command", handler)` and separately calls `ctx.events.observe("llm:response", handler)`
- **THEN** the first remains an interceptor (async, ordered, shared mutable, cancel-capable) and the second is an observer (synchronous, fire-and-forget), and neither changes the other's semantics

#### Scenario: Observation does not delay the emitter

- **WHEN** an observer handler performs synchronous work while an event is emitted
- **THEN** the emitting code is not awaited on the handler's completion and the run continues

### Requirement: Declared observable event set

The system SHALL classify every registered `AgentEventType` as either **observable** or **internal** in a single declared table, and SHALL derive the accepted event names for `observe` / `observeAny` / `retained` from that table. Adding an event to the registry MUST make the table fail to compile until the new event is classified. The interceptor-only event namespace MUST NOT be observable.

#### Scenario: Unclassified event fails to compile

- **WHEN** a developer adds a key to the `AgentEvents` registry without adding a classification row
- **THEN** the project fails to typecheck at the classification table

#### Scenario: Internal event is not observable

- **WHEN** a consumer passes a name classified as internal to `observe`
- **THEN** the project fails to typecheck

#### Scenario: Interceptor events are not observable

- **WHEN** a consumer attempts to observe `tool:before:run_command`
- **THEN** the project fails to typecheck, because interceptor events are not part of the observer event registry

### Requirement: `observeAny` covers exactly the declared observable set

`observeAny` SHALL deliver every event classified as observable in the subscribing extension's scope, and MUST NOT deliver events classified as internal — specifically the high-frequency streaming events (`tool:chunk`, `tool:clear`) and the extension-UI channel (`extension:ui`). The implementation MUST NOT use the bus's `"*"` wildcard subscription, so the core wildcard subscriber remains the Event→Log bridge alone.

#### Scenario: Broad observer receives declared events

- **WHEN** an extension calls `ctx.events.observeAny(handler)` and the agent emits `llm:response` and `subagent:completed`
- **THEN** `handler` receives both events

#### Scenario: Broad observer excludes internal events

- **WHEN** an extension calls `ctx.events.observeAny(handler)` and the agent emits a `tool:chunk` streaming event or an `extension:ui` notification
- **THEN** `handler` does not receive that event

#### Scenario: Wildcard consumer invariant holds

- **WHEN** a consumer inspects every `on("*")` subscription in core
- **THEN** the Event→Log bridge is still the only wildcard subscriber

### Requirement: Observation replay semantics

`observe` SHALL deliver a retained event's current value once, synchronously, at subscription time unless the caller passes `{ replay: false }`. `observeAny` MUST NOT replay retained values at subscription time. `retained(type)` SHALL return the current retained value on demand without subscribing.

#### Scenario: Late observer receives current value

- **WHEN** an extension calls `ctx.events.observe("session:usage", handler)` after usage state exists
- **THEN** `handler` is invoked once immediately with the current usage snapshot, then again on each subsequent change

#### Scenario: Broad observer does not receive a replay burst

- **WHEN** an extension calls `ctx.events.observeAny(handler)` while several retained values are already set
- **THEN** `handler` is not invoked for those existing values at subscription time

#### Scenario: On-demand retained read

- **WHEN** an extension calls `ctx.events.retained("session:todos")`
- **THEN** it receives the current todo snapshot (or `undefined` when none is set) without registering a subscription

#### Scenario: Explicit opt-out of replay

- **WHEN** an extension calls `ctx.events.observe("session:usage", handler, { replay: false })`
- **THEN** `handler` is not invoked with the current value at subscription time but is invoked on subsequent changes

### Requirement: Observation is scoped to the extension's agent scope

Observers SHALL register on the extension's own scoped bus, so a root-scope extension receives subagent events up-flow without comparing `agentId` / `parentId`, and a subagent-scoped extension does not receive sibling scopes' events.

#### Scenario: Subagent events reach a root-scope observer

- **WHEN** a subagent emits `subagent:completed` and a root-scope extension has called `observeAny`
- **THEN** the extension's handler receives the event without any manual parent-id comparison

#### Scenario: Sibling scopes stay isolated

- **WHEN** two agents each hold their own scope and one emits an observer event
- **THEN** an extension observing on the other agent's scope does not receive it

### Requirement: Observer failures are contained

A failure in an observer handler MUST NOT propagate into the agent loop or break other observers. A synchronous throw SHALL be contained by the observer dispatch mode; a returned rejected promise SHALL be caught by the extension observer facade and reported as an `agent:extension-error` event with an observer phase.

#### Scenario: Synchronous throw is contained

- **WHEN** one observer throws while another observer is registered for the same event
- **THEN** the second observer still receives the event and the emitting code is unaffected

#### Scenario: Rejected promise is reported, not unhandled

- **WHEN** an observer handler returns a promise that rejects
- **THEN** the rejection is caught and reported as an `agent:extension-error` with the observer phase, and no unhandled rejection surfaces

### Requirement: Observer teardown and re-registration

Every disposer returned by `observe` / `observeAny` SHALL be honoured, and disabling or destroying an extension SHALL unsubscribe all of its observers so a disabled extension stops receiving events. Re-enabling an extension SHALL let it register observers again without duplicates.

#### Scenario: Disable stops observation

- **WHEN** an extension that registered observers is disabled
- **THEN** its handlers are no longer invoked for subsequent events and other extensions' observers are unaffected

#### Scenario: Explicit disposer unsubscribes

- **WHEN** an extension calls the disposer returned by `observe`
- **THEN** its handler is no longer invoked for that event

#### Scenario: Re-enable re-registers without duplicates

- **WHEN** an extension is disabled and then re-enabled and re-registers its observers
- **THEN** each handler is invoked once per matching event, not twice

### Requirement: Observed payloads are shared and read-only

Observer payloads SHALL be the same objects delivered to other in-scope consumers (the session channel projection and the Event→Log bridge). An extension MUST treat an observed payload as read-only and MUST NOT mutate it.

#### Scenario: Payload identity is preserved

- **WHEN** an event with a payload is delivered to an extension observer and to the Event→Log bridge in the same scope
- **THEN** both receive the same payload object

#### Scenario: Mutation is a contract violation

- **WHEN** an extension mutates an observed payload
- **THEN** the mutation affects the shared live state, so the change is documented as a contract violation and no deep copy is made by the bus

