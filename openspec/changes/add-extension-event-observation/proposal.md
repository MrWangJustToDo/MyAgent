## Why

Extensions can currently only **intercept** — `ctx.registerInterceptor(hook, handler)` is bound to six hook names (`tool:before:*`, `tool:after:*`, `tool:error:*`, `session:start`, `session:shutdown`, `before_agent_start`). They cannot **observe**. Meanwhile the unified `AgentEventBus` already emits ~57 telemetry events (`llm:request`/`llm:response`, `memory:*`, `compaction:*`, `subagent:*`, `plan:*`, `session:usage`/`session:todos`/`session:plan` as retained values), and the only consumer in the whole codebase is the Event→Log bridge. An extension that wants to react to "the model just answered", "a subagent started", or "context crossed 80%" has no channel for it, and the scoped bus is a private field of `ExtensionRunner`.

This is the largest single gap in the extension surface: it blocks every observational extension (cost/usage HUDs, auto-actions, telemetry exporters, and — as established separately — the eventual conversion of logging itself into a built-in extension, which is the only existing `"*"` consumer and therefore the natural acceptance test for this API).

## What Changes

- Add an **observer surface** to `ctx.events`: `observe(type, handler, { replay? })`, `observeAny(handler, { replay? })`, and `retained(type)`, returning disposers that unregister on extension disable/destroy.
- Route all three through the extension's **scoped** bus, so a root-scope extension sees subagent events up-flow, exactly as the Event→Log bridge does.
- Constrain the API to a **declared observable event set** derived from the event registry, so `ctx.events.observe("...")` only accepts declared names and adding a new event is a deliberate act (drift-guarded by a validator).
- Do **not** give extensions the bus's raw `"*"` wildcard: `observeAny` expands to the declared observable set. This keeps the existing invariant — the Event→Log bridge remains the only `"*"` consumer — literally true.
- Reject nothing that already works: interception semantics, hook names, and `ctx.events`'s existing `on`-as-interceptor spelling are unchanged.
- Document the observation surface as a **bus-backed** extension member (it reuses the observer dispatch mode that already exists; it is not a third mode), and extend `ExtensionRegistrations` so disable/destroy tears the observers down.

Explicitly **not** in this change (phased follow-ups, see Impact): extension ordering/priority, additional UI surfaces, extension-driven actions (`sendMessage`/`setModel`), extension-initiated user questions, extension packaging/trust, and the conversion of `AgentLog` into a built-in extension.

## Capabilities

### New Capabilities

- `extension-event-observation`: the contract by which an extension subscribes to the agent's declared observer events — the observable event set, subscription/replay semantics, scoping, failure containment, and teardown.

### Modified Capabilities

- `agent-event-bus`: the requirement "Extension API backed by the unified bus" is extended to declare the observer accessors as an explicit bus-backed member of the extension event facade (and to state that the bus itself still exposes exactly `emit` and `intercept`).

## Impact

**Affected code**

- `packages/core/src/agent/extension/types.ts` — observable event set, observer types, `ExtensionRegistrations.unsubObservers`.
- `packages/core/src/agent/extension/runner.ts` — observer accessors on the wrapped context, registration bookkeeping, teardown.
- `packages/core/src/agent/extension/index.ts`, `packages/core/src/index.ts` — exports.
- `packages/core/src/agent/agent-event-bus/meta.ts` — read-only source for the observable set (no behavior change).
- `packages/core/src/agent/skills/builtin/write-extension.md.ts` — the authoring skill currently documents "five registration channels"; it gains the observation channel.
- `packages/core/ARCHITECTURE.md` — the non-bus-extension-surface enumeration and the extension interception section.
- `packages/core/scripts/validate-extension-event-observation.mjs` (new) + `packages/core/package.json` script + CI wiring; `validate-core-public-exports.mjs` if it pins the extension export surface.

**Affected specs**

- `agent-event-bus` (modified requirement), `extension-event-observation` (new).

**Non-goals / phased follow-ups** (each is its own change; recorded here so the roadmap is not lost)

1. *This change* — extension event observation.
2. Refactor logging into a built-in extension (`createLogExtension`): the `log:entry` generic telemetry event, the emit-layer split that keeps the 68 direct `log.*` call sites as a thin always-on emission seam, the move of `event-log-rules`/`summarizePayload`/the file sink into the extension, and a new **extension flush/teardown contract** (`flushSync` on exit). This is the acceptance test for the API introduced here.
3. Extension ordering (`order?: number`), then additional host UI surfaces (`header`/`status`/`banner`) and the `useExtensionPanel` → extension-manager rename.
4. Extension-driven actions (`sendMessage` / `setModel` / `setActiveTools`) and extension-initiated user questions (`ctx.ui.ask`, reusing the existing retained `session:interaction` channel).
5. Extension packaging (`extension.json` manifest, `install`/`remove` — `ExtensionManifest` in the loader is currently dead code) and a project-trust model.

**Risk note.** The API is additive and reversible; nothing in the agent loop changes. The one cross-cutting rule it touches is the wildcard-consumer invariant in `agent-event-bus`, which the `observeAny`-expands-to-declared-set decision preserves deliberately.
