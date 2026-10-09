## Context

`ExtensionRunner` holds a **scoped** `AgentEventBus` as a private field (`runner.ts:291`, `rawBus`) and routes the extension-facing facade (`ctx.events`) through `BusExtensionEventBus`, which registers only *interceptors* (`bus.onIntercept`) — see `bus-extension-event-bus.ts:19,24`. So an extension can change or block an operation, but cannot observe one.

Observer dispatch already exists on the bus and is fully specified (`agent-event-bus` — "Observer and interceptor dispatch modes"): synchronous, registration-ordered, fire-and-forget, error-isolated. The Event→Log bridge is its only consumer today (`bridgeTelemetryToAgentLog` → `bus.on("*")`). The capability therefore exists; only the extension-facing accessor is missing.

Three existing constraints shape the design:

1. `agent-event-bus` — "The Event→Log bridge SHALL be the only core wildcard consumer." A naive `ctx.observeAny = bus.on("*")` would falsify this invariant and, worse, deliver *internal* events.
2. `agent-event-bus` — "Extension API backed by the unified bus … the bus still exposes exactly `emit` and `intercept`", and "Non-bus extension surfaces are explicitly declared." The observer accessor must be classified as bus-backed, and must not look like a third dispatch mode.
3. `agent-event-envelope` — payloads are the same object for every subscriber (the interceptor contract relies on shared mutation). Observer payloads are consequently **shared references** into live session state.

## Goals / Non-Goals

**Goals**

- Give extensions a first-class **observer** channel for the declared telemetry/state events, with the same containment and teardown guarantees as the other registration channels.
- Keep the observable event set **explicit and compile-time exhaustive**, so a new event cannot silently become observable (or silently fail to be).
- Preserve, not weaken, the existing bus invariants: two dispatch modes, one wildcard consumer, interception semantics and hook names unchanged.
- Make the API usable by the next planned consumer (a built-in logging extension) without a second design pass.

**Non-Goals**

- Extension-driven actions (`sendMessage`/`setModel`/`setActiveTools`) and extension questions to the user (`ctx.ui.ask`) — separate changes.
- Extension ordering (`order`/priority) — separate change.
- Converting `AgentLog` into an extension — the follow-up change that *consumes* this API.
- Awaited/durable observer semantics: observers stay fire-and-forget; durability is handled outside the bus (`agent-event-bus` — "Durability does not depend on the bus").

## Decisions

### D1 — Observation lives on the existing `ctx.events` facade as three named methods

`ctx.events` keeps `emit` / `on` / `off` (interception, unchanged) and gains:

```ts
ctx.events.observe(type, handler, opts?)   // one declared event → disposer
ctx.events.observeAny(handler, opts?)      // every declared observable event → disposer
ctx.events.retained(type)                  // current retained value, or undefined
```

*Why not a new top-level member* (`ctx.observe`): the events facade is already "the extension's view of the bus", and one facade keeps the "exactly one event surface" story intact. *Why not overload `on`*: `on` is the established interceptor spelling (`bus-extension-event-bus.ts:22`), and `write-extension.md` teaches it; reusing the name for a different dispatch mode would be the exact "third dispatch mode by accident" the spec forbids.

Implementation mirrors `wrapUi(ownerId)` (`runner.ts:412`): the shared interceptor facade is stateless w.r.t. its owner, so `createContext` builds a **per-extension** object that spreads it and adds owner-scoped observer closures bound to `api.id` and that instance's `registrations`.

### D2 — The observable set is a declared, exhaustively-classified table

```ts
export const EXTENSION_EVENT_VISIBILITY = {
  "session:start": "observable", /* … one row per AgentEventType … */
  "tool:chunk": "internal",
} as const satisfies Record<AgentEventType, "observable" | "internal">;
```

`satisfies Record<AgentEventType, …>` is the guard that matters (same idiom as `MODEL_CAPABILITY_FLAGS` in `extension/types.ts:61`): **adding an event to the registry breaks compilation here until it is classified.** `ObservableExtensionEvent` is derived from the table, so `ctx.events.observe("…")` and `observeAny` only accept observable names.

Default is `observable`. `internal` is reserved for two kinds, each requiring a stated reason in the table:
- **high-frequency streaming** (`tool:chunk`, `tool:clear`) — already have a dedicated UI path; exposing them invites per-chunk work in extension code;
- **the extension-UI channel itself** (`extension:ui`) — observing it lets extensions see each other's publishes, coupling unrelated extensions through a private back-channel.

`session:usage` / `session:todos` / `session:plan` / `session:mode` / `agent:state` / `agent:iteration` are retained and therefore observable **cheaply**: a late subscriber gets the current value immediately rather than waiting for the next change.

### D3 — `observeAny` expands the declared set; the bus wildcard stays single-consumer

`observeAny` registers one `bus.on(name)` per observable name rather than `bus.on("*")`.

- It is **required for correctness**: `"*"` would deliver `tool:chunk` / `extension:ui`, contradicting D2's table.
- It keeps constraint (1) literally true — a validator can still assert that `bridgeTelemetryToAgentLog` is the only `on("*")` call site.
- Cost is bounded (~50 subscriptions) and only paid when an extension actually calls `observeAny`.

### D4 — Scoping: the extension's own scoped bus

Observers register on the runner's scoped bus, so a root-scope extension receives subagent events up-flow (`subagent:*` from a child scope) with no manual `agentId`/`parentId` comparison — the routing guarantee `agent-event-bus` already specifies. A subagent-scoped runner's extension sees only its own scope.

### D5 — Async handler rejections are contained, not just sync throws

The bus's observer path is synchronous, so a handler that returns a rejected promise would otherwise surface as an unhandled rejection and can, via `installAgentLogProcessGuards`, take the process down. The observer facade wraps each handler: a returned thenable gets a `.catch` that reports through the established channel — `agent:extension-error` with `phase: "event-observer"` — exactly as `reportTransformerFailure` does (`runner.ts:338-346`). Nothing an extension observes can abort a run.

### D6 — Replay defaults: explicit reads for `observe`, none for `observeAny`

- `observe(type, handler)` — `replay` defaults to `true`, delegating to `bus.on` (retained events deliver their current value once, synchronously).
- `observeAny(handler)` — `replay` defaults to `false`, so a broad subscriber is not hit with a burst of retained snapshots at registration.
- `retained(type)` — on-demand read for callers that want the current value without subscribing.

### D7 — Teardown is bookkeeping, in place

`ExtensionRegistrations` gains `unsubObservers: Array<() => void>`. `unregisterInstanceArtifacts` unsubscribes and clears it **in place** (`.length = 0`), matching the existing arrays — the closures captured by `createContext` reference the same array, so reassigning would desync a re-enabled extension.

### D8 — Payloads are shared references: read-only by contract

Observer payloads are the same objects the session channel projection and the Event→Log bridge see. An extension that mutates one mutates live state (the same hazard class the wire-projection purity rules guard against). Decision: the contract is **read-only**; it is documented in the authoring skill and the architecture doc, and a validator asserts the API exposes payloads by reference (so the contract is explicit rather than accidental). Deep-freezing was considered and rejected: it would change behavior for existing in-core consumers and cost per-emit work on the hot path.

## Risks / Trade-offs

- **Payload mutation corrupts live state** → documented read-only contract; explicitly not "fixed" by freezing, to avoid a hot-path cost and a behavior change for existing consumers. Recorded as a known trade-off in the architecture doc.
- **High-frequency observation starves the loop** → the observable set excludes streaming events; `observeAny` is opt-in and bounded; observer errors are contained (D5) so a slow/broken observer degrades only itself.
- **Event surface churn** → the compile-time exhaustive table makes a new event a deliberate classification step, and a validator fails CI when the table and the registry disagree.
- **`observeAny` subscriptions scale with the table** → ~50 subscriptions per `observeAny` caller, only when called; acceptable, and revisit if the table grows an order of magnitude.
- **Two "listen" spellings (`on` = intercept, `observe` = observe)** are inherently confusable → both the authoring skill and the architecture doc contrast them explicitly, and `observe` returns a documented disposer.

## Migration Plan

1. Types + table + `ObservableExtensionEvent` (compiles against the full registry; no runtime change).
2. Per-extension observer facade in `createContext`; registrations + teardown.
3. Exports (`extension/index.ts`, core `index.ts` if the type is public) and the authoring skill.
4. Validator + `package.json` script + CI wiring; run `validate:extensions-middleware`, `validate:extension-ui-channel`, `validate:event-log-bridge`, `validate:core-public-exports` for regressions.
5. Architecture doc: add the observation member to the extension interception section and the non-bus-surface enumeration.

**Rollback:** the API is purely additive and nothing in the agent loop changes; reverting the commit removes a surface no core code calls.

## Open Questions

- Should `session:messages` (a large retained array) be observable in this phase, or deferred until a concrete exporter needs it? Current decision: observable, because retained reads are cheap and it only emits on change.
- Should `observeAny` be split into `observeAll` (every observable event) and `observeMatching(prefix)` (e.g. `subagent:*`)? Deferred: a prefix form is a convenience over the same expand-to-declared-set mechanism and can land later without changing the contract.
