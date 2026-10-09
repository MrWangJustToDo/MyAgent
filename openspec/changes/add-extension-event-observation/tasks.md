## 1. Observable event set and types

- [x] 1.1 Add `EXTENSION_EVENT_VISIBILITY` to `packages/core/src/agent/extension/types.ts` as an exhaustive table over `AgentEventType` (`as const satisfies Record<AgentEventType, "observable" | "internal">`), defaulting every event to `observable`
- [x] 1.2 Classify the exceptions explicitly and give each a one-line reason in the table: `tool:chunk`, `tool:clear` (high-frequency streaming, already have a UI path) and `extension:ui` (would couple extensions through each other's publishes)
- [x] 1.3 Derive `ObservableExtensionEvent` from the table and add the observer types: `ExtensionEventObserver` (envelope in, `void | Promise<void>` out), `ExtensionObserverOptions` (`{ replay?: boolean }`)
- [x] 1.4 Add `unsubObservers: Array<() => void>` to `ExtensionRegistrations`
- [x] 1.5 Add the observer accessors to the extension event facade type: `observe<T>(type, handler, options?)`, `observeAny(handler, options?)`, `retained<T>(type)` — with the returned-disposer contract documented on each

## 2. Runner wiring

- [x] 2.1 In `packages/core/src/agent/extension/runner.ts`, replace the shared `events: this.eventBus` in `createContext` with a per-extension object that spreads the shared `ExtensionEventBus` and adds owner-scoped `observe` / `observeAny` / `retained` closures (mirrors `wrapUi(ownerId)`); interception accessors stay untouched
- [x] 2.2 `observe` registers `rawBus.on(type, wrapped, { replay })` with `replay` defaulting to `true`; `retained` reads `rawBus.retainedValue(type)`
- [x] 2.3 `observeAny` registers one `rawBus.on(name, wrapped, { replay: false })` per observable name from the table; it MUST NOT call `rawBus.on("*")` (keeps the Event→Log bridge the only wildcard subscriber)
- [x] 2.4 Wrap every handler in the async-rejection guard (`Promise.resolve(result).catch(...)`) reporting `agent:extension-error` with `phase: "event-observer"`, so a rejected observer promise never becomes an unhandled rejection
- [x] 2.5 Push each disposer into the instance's `registrations.unsubObservers`
- [x] 2.6 In `unregisterInstanceArtifacts`, unsubscribe the observers and clear the array **in place** (`length = 0`), alongside the existing arrays, so a re-enabled extension re-registers cleanly

## 3. Exports and documentation

- [x] 3.1 Export the new types/constants from `packages/core/src/agent/extension/index.ts`
- [x] 3.2 Export the public copy from `packages/core/src/index.ts` (curated surface — only what an extension author needs to name the observable set), and confirm `packages/app/scripts/validate-core-imports.mjs`'s allowlist needs no change
- [x] 3.3 Update the built-in `write-extension` skill (`packages/core/src/agent/skills/builtin/write-extension.md.ts`): it currently teaches "the five registration channels" — add the observation channel and a worked example (`ctx.events.observe("llm:response", …)`), and contrast `on` (intercept) vs `observe` (observe)
- [x] 3.4 Update `packages/core/ARCHITECTURE.md`: add the observation member to the extension interception section, and record (a) the observable-vs-internal classification rule, (b) that observed payloads are shared references and read-only, (c) that the Event→Log bridge remains the only wildcard consumer

## 4. Validator

- [x] 4.1 Add `packages/core/scripts/validate-extension-event-observation.mjs` (imports `../dist/dev.mjs`) asserting:
  - the classification table covers every `AgentEventType` and every `internal` row has a reason (assert table/registry parity the same way `validate-session-interaction-channel.mjs` asserts meta parity)
  - `observe` delivers a telemetry event and `retained`/replay return the current retained value synchronously, with `{ replay: false }` suppressing it
  - `observeAny` receives declared events and does **not** receive `tool:chunk` / `extension:ui`
  - a `"*"` subscription count in core still has the Event→Log bridge as its only call site
  - a throwing observer does not prevent a second observer from receiving the event
  - a rejected observer promise is reported as `agent:extension-error` (observer phase) and does not throw
  - disable/destroy unsubscribe all observers; re-enable + re-register invokes each handler exactly once
  - **inversion checks** (per the repo's authoring rules): a deliberately unclassified event and a deliberately internal event each fail the parity/typing assertion
- [x] 4.2 Add a `validate:extension-event-observation` entry to `packages/core/package.json` (`pnpm run build && node scripts/validate-extension-event-observation.mjs`); CI coverage is automatic via `pnpm run validate:all`'s glob discovery

## 5. Verification

- [x] 5.1 `pnpm build:core` then run the new validator
- [x] 5.2 Run the adjacent validators for regressions: `validate:extensions-middleware`, `validate:extension-ui-channel`, `validate:extension-pi-like`, `validate:extension-tool-restore`, `validate:event-log-bridge`, `validate:core-public-exports`
- [x] 5.3 `pnpm typecheck` and `pnpm lint` on a built checkout (bounded heap — the repo-level commands OOM on this machine)
- [x] 5.4 Confirm no behavior change on the interceptor path: the six existing hooks and `write-extension.md`'s existing examples still pass

## 6. Spec and handoff

- [x] 6.1 `openspec validate add-extension-event-observation --strict` passes
- [x] 6.2 Record the follow-up roadmap as separate changes after this one is archived: (a) `logging-as-builtin-extension` — the `log:entry` generic event, the emit-layer split, moving the rules/sink into a `createLogExtension`, and the new extension flush/teardown contract; (b) extension ordering, extra UI surfaces, extension actions/questions, packaging + trust — the observation surface introduced here is the prerequisite for (a)


## Implementation notes (deviations from the plan above)

- **`observe` / `observeAny` / `retained` live in a new `agent/extension/observer-surface.ts`**, not inline in `runner.ts`. The runner was at 796 non-blank lines against the 800 `max-lines` ceiling; adding the observer surface inline would have required a lint disable. Extracting it is the repo's preferred remedy and the seam is cohesive (it is a pure adapter over the bus's observer mode).
- **`DefaultExtensionUI` moved to a new `agent/extension/default-extension-ui.ts`** for the same reason: after the observer extraction the runner was still 834 non-blank lines, and the UI implementation (slots / throttling / dedupe / owner scoping) is a self-contained concern. The runner now holds the runner itself: 668 non-blank lines. Both new modules stay package-private (not barrel-exported).
- **Task 2.1 wording correction:** the facade does **not** spread `this.eventBus`. `BusExtensionEventBus` keeps `emit` / `on` / `off` on its prototype, so a spread would silently drop them. The facade delegates the three explicitly and composes the observer surface alongside.
- 3.1/3.2 also export `EXTENSION_EVENT_VISIBILITY` + `observableExtensionEvents()` (public, from core's curated entry) and re-export both from `dev.ts`, so the validator asserts against the real table rather than re-deriving the filter.
- Verification evidence: `pnpm build:core` ok; the new validator passes (9 sections); `run-all-validators --dir packages/core` = 166 passed / 0 failed / 1 unrelated skip (`validate-tanstack-adapter`, endpoint 403); `pnpm --filter @codent/core tsc --noEmit` clean; `eslint` clean on all touched files; `validate-core-imports` (app allowlist) clean.
