## 1. Pre-commit A — bootstrap entries stop being discarded

- [x] 1.1 Add a bounded pending buffer to the log emission seam (`packages/core/src/agent/agent-log/agent-log.ts`): entries emitted before a sink is bound are retained up to a named cap constant, and entries beyond the cap drop the oldest (never grow unbounded)
- [x] 1.2 Drain the pending buffer on sink attach, in emission order, before any newly emitted entry; assert each retained entry is written exactly once (not replayed by a later re-attach)
- [x] 1.3 Update `packages/core/scripts/validate-agent-log-file-sink.mjs`: the docstring at the top claims backfill while `:68` asserts pre-attach entries are dropped — make both state the new contract, and turn the "pre-attach entries dropped" assertion into "pre-attach entries retained once"
- [x] 1.4 Add a cap-overflow assertion to that validator: emitting past the cap keeps the file bounded and does not drop post-attach entries
- [x] 1.5 Add a bootstrap-visibility assertion (extend `validate-agent-log-host-sink.mjs`) that a session which fails to activate an extension has that failure in the persisted log — this is the assertion that fails today
- [x] 1.6 Verify: `pnpm build:core`, the two touched validators, and `node scripts/run-all-validators.mjs --dir packages/core`

## 2. Pre-commit B — teardown stops racing the log flush

- [x] 2.1 `packages/core/src/managers/agent-manager.ts` `destroyAgent`: `await` the extension teardown instead of `void runner.destroyAll()`, preserving the current order (`emitSessionShutdown` → `destroyAll` → `flushLogOnDestroy`)
- [x] 2.2 Make `destroyAgent` async (or extract an async teardown helper) and update every caller so the await is not dropped at the next level up; confirm `AgentManager.reset()` still tears down every agent
- [x] 2.3 Add an ordering assertion: a teardown that performs asynchronous work completes before the log sink is released (extend the new teardown validator from group 5, or `validate-agent-log-host-sink.mjs` for this commit — whichever lands first owns it)
- [x] 2.4 Verify: `pnpm build:core`, touched validators, full core suite

## 3. The seam→extension handoff (originally `log:entry`)

- [x] 3.1 ~~Add `log:entry` to the event registry~~ — **abandoned, then removed.** The first attempt declared it on `AgentEvents`; it was withdrawn in group 4 once the handoff became a direct injection (see the group-4 notes). The registry, `AGENT_EVENT_META`, `EXTENSION_EVENT_VISIBILITY` and the rules table are all back to their pre-change state for this key.
- [x] 3.2 ~~`AGENT_EVENT_META` row with no `channel`~~ — withdrawn with 3.1
- [x] 3.3 ~~`EXTENSION_EVENT_VISIBILITY` row as `internal`~~ — withdrawn with 3.1
- [x] 3.4 ~~rules-table classification entry~~ — was already unnecessary; moot now
- [x] 3.5 Define the handoff as a **direct sink injection** instead: `AgentLog.attachSink({ handleEntry, flush, flushSync, dir? })` / `detachSink()`, keeping level/`minLevel` filtering, `setRun` stamping and error shaping in the seam. Recursion is impossible by construction, so no visibility classification is needed. `attachFileSink` stays on the seam as a thin delegate over `createJsonlFileSink` — that is what keeps the validators and `log-capture.mjs` unchanged (see 4.9).
- [x] 3.6 Update `validate-extension-event-observation.mjs`: `INTERNAL_EVENTS` stays at its three real members (`tool:chunk`, `tool:clear`, `extension:ui`), and §6 asserts the exclusion directly — a wildcard listener receives business events and none of the internal ones. The both-directions check of the declared internal set stays.
- [x] 3.7 Verify: `pnpm build:core`, `validate-extension-event-observation`, full core suite

## 4. The built-in log extension

- [x] 4.1 Create `packages/core/src/agent/log/extension.ts` exporting exactly one canonical `createLogExtension` (`LogExtension` = `bus` + `attachSink` + `start` + `dispose`), following built-in-extension conventions
- [x] 4.2 Move the event→entry rule table (`event-log-rules.ts`) and its `formatMessage` formatters into the domain (`git mv` from `managers/telemetry/`); keep the compile-time exhaustiveness over `AgentEventPayloadMap`
- [x] 4.3 Keep `summarizePayload` and the custom multi-entry handlers (`session:mcp`, `memory:*`, `compaction:auto-*`) — including the `cancelled`-payload carve-out that avoids attaching a synthesized error — in `event-log-bridge.ts`, also moved with history
- [x] 4.4 Move the JSONL file sink, rotation, session-boundary divider and 5 MiB / 5 file / 250 ms defaults out of `AgentLog.attachFileSink` into `jsonl-file-sink.ts` (own module, `env` + types only — see the barrel note). Wire `logEntrySchema` validation into the extension's intake.
- [x] 4.5 The bridge's `bus.on("*")` install site moves out of `AgentManager`'s constructor into the log extension, which owns it via `start()` / `dispose()`; `AgentManager.getLogExtension()` exposes the instance. Movement, not rewrite (see the group-4 notes).
- [x] 4.6 Keep per-agent resolution in core (session-derived directory, subagent filename inside the parent directory) and pass it to the extension as a binding — `ctx` is not extended with session identity.
- [x] 4.7 **Kept on `AgentLog` deliberately:** `attachFileSink`, `getFileSinkDir`, `flush`, `flushSync`. Removing them would have rewritten `log-capture.mjs` and 3 log validators for no product gain; `attachFileSink` is now a thin delegate. The dir moved to the **sink** (`LogFileSink.dir?`) so an inert sink (no `appendFile`) reports no directory and a subagent is not pointed into a path nothing writes.
- [x] 4.8 `ctx.logger` behaviour unchanged end to end (still funnels into the seam, still the `hooks` category) — asserted by count during the move
- [x] 4.9 **No validator edits required for the move:** all 6 log validators and `log-capture.mjs` pass unmodified. Two of them (`validate-agent-log-file-sink`, `validate-agent-log-host-sink`) failed on the first attempt because `getFileSinkDir` briefly recorded the requested dir; the fix was the sink-owned `dir` (4.7), not an assertion change.
- [x] 4.10 Verify: all 6 log validators, full core suite (166 passed / 0 failed / 1 skipped)

## 5. Extension flush / teardown contract

- [x] 5.1 Extend the extension API with an optional awaited flush phase (`ctx.registerFlush`) and a synchronous exit flush (`ctx.registerExitFlush`); both optional, both identity-checked disposers so a stale one cannot clear a newer registration
- [x] 5.2 Implement the ordered teardown in `agent/extension/runner.ts`: `session:shutdown` → awaited flush (per extension) → deactivate → unregister registrations + clear UI slots. The flush is a separate private phase (`flushExtension`) reported as `agent:extension-error` with phase `flush`, so a failing flush does not skip deactivate.
- [x] 5.3 Release both registrations in `unregisterInstanceArtifacts` (flush slot + the process-wide exit registration), so a destroyed extension stops running on `exit`
- [x] 5.4 Wire the exit path: `installAgentLogProcessGuards`'s fatal handler **and** `process.on("exit")` call `flushExtensionExitFlushesSync()` alongside the existing active-log flush; it never throws
- [x] 5.5 Register the log extension's flush on both paths: `createLogExtension.start()` registers a sync flush that lands every attached sink's pending batch, and `dispose()` releases it
- [x] 5.6 New validator `scripts/validate-extension-flush.mjs`: flush-before-deactivate ordering, throwing flush reported + teardown continues, disable-only-that-extension, exit path runs, throwing exit flush contained, destroy releases the registration, log extension's batch lands on the exit path. Three inversions were run against it and all failed correctly (see notes).
- [x] 5.7 Verify: full core suite — 167 passed / 0 failed / 1 skipped

### 5.7b Entry schema is enforced at the write boundary (task 4.4)

- [x] `jsonl-file-sink` validates each entry against `logEntrySchema` before writing and rejects non-conforming entries with a `console.error`. The persisted-schema requirement in `log-extension` had no enforcement point before this — the schema existed only for readers (`validate-structured-query`), so a `LogCategory` added to `types.ts` but missing from `schemas.ts` would write entries no reader accepts. **Known cost, recorded in the code:** the category list is now declared twice with a rejection on mismatch, so the compiler can no longer catch that omission.

### 5.7a Open validator gap (from group 4, option (c))

- [x] Assert that no `internal` event carries an entry rule — implemented as `validate-extension-event-observation` §7b, with a live-lookup canary (`session:start`) so the check cannot pass vacuously. Verified by adding a rule to `tool:chunk` and watching it fail.

## 6. Docs, specs and final validation

- [x] 6.1 Update `packages/core/ARCHITECTURE.md`: AgentLog is the emission seam, the log extension owns policy, the wildcard consumer is the log extension, and the teardown/flush contract is documented — verified at `ARCHITECTURE.md:587` (seam + policy + `MAX_PENDING_LOG_ENTRIES` + per-`AgentLog` sink handoff), `:1101` (module map), `:869`/`:917` (the log extension is the single `"*"` consumer, wildcard ≡ `observeAny`), `:940`/`:942` (`session:shutdown` → `flush` → `deactivate` order; `settleTeardowns()` for ordered shutdown; the extension's sync exit flush)
- [x] 6.2 Update `AGENTS.md`'s AgentLog / Event→Log bridge / `.agents/logs` wording (`AGENTS.md:195`, `:506`, `:587`, `:946`); re-checked that `write-extension.md.ts:371`'s `.agents/logs/<sessionId>/agent.log` debugging instruction is still accurate — the sink still writes that path, so the sentence stands as written (not merely reworded)
- [x] 6.3 Confirm the public export surface: `AgentLog` is **not** exported from `packages/core/src/index.ts` (only the `LogEntry`/`LogCategory`/`LogLevel` types and `installAgentLogProcessGuards`), and it stays in `packages/app/scripts/validate-core-imports.mjs`'s `FORBIDDEN_IDENTIFIERS`
- [x] 6.4 Update `openspec/specs` only through this change's deltas; run `openspec validate logging-as-builtin-extension --strict` — the five deltas are `agent-event-bus`, `agent-lifecycle-events`, `agent-log-timeline`, `extension-teardown`, `log-extension`; the change validates clean
- [x] 6.5 Full workspace check: `pnpm build` ✓, `pnpm typecheck` ✓ (0 errors), `pnpm lint` ✓ (clean), `pnpm run validate:all` — **197 passed / 1 failed / 2 skipped**. The single failure is `validate-model-capabilities`, which is unrelated to this change: it is an upstream models.dev corpus drift (the corpus now emits a payload field `ModelsDevModel` does not declare), and this change touches no file under `models/`. The same failure reproduces on a clean checkout.


## Implementation notes (deviations from the plan above)

### Group 3/4 — the handoff became a direct injection, so the event was removed

The plan's central mechanism was a `log:entry` bus event. Implementing it produced three findings that together made the mechanism impossible, and the reversal is the largest deviation in this change.

1. **The layer gate moved the declaration (kept as a lesson).** The first attempt put `log:entry` in `AgentEventPayloadMap`, which required `runtime-types/agent-event-payloads.ts` to import `agent/agent-log/types.ts`. `validate-layer-boundaries` failed it correctly: `runtime-types` is the shared **leaf** and `runtime-types → agent` is registered `type-only` for exactly one source (`hosts.ts`, the `AgentUIChannel` port). Declaring it on `AgentEvents` (`agent/agent-event-bus/types.ts`, layer `agent`) was legal and more accurate — a bus-internal notification belongs with the session-projection events. The gate was right and the reason is recorded at the declaration site; the declaration itself did not survive finding 3.
2. **The compile guard chain really does work** (this finding stands and was the point of P1's table): adding the registry key immediately produced three compile errors — `AGENT_EVENT_META` row, `EXTENSION_EVENT_VISIBILITY` classification, rules-table row. "Adding an event is a deliberate act" was observed, not assumed.
3. **The event cannot be delivered to its only consumer.** The then-current belief was that a raw `bus.on("*")` would receive `log:entry`, so the log extension would have to avoid the raw wildcard (`observeAny`, or a visibility check in the handler). Reviewing that produced option (c) — withhold internal events from wildcard fan-out — precisely so the extension *could* keep the wildcard and still not see its own write. Implementing the seam then made the circularity explicit: internal events are withheld from wildcard delivery **and** from `observeAny`, so the only way to deliver `log:entry` is to make it observable, which is exactly the self-observation the design existed to prevent. An event whose sole consumer must not receive it is a callback wearing an event's clothes.

**The replacement:** the seam takes the sink the extension built — `AgentLog.attachSink({ handleEntry, flush, flushSync, dir? })` / `detachSink()`. Recursion is impossible by construction (the sink never emits), there is no visibility classification to get right, and no payload/API commitment for a per-entry broadcast that `agent-log-timeline` declines to make anyway. The cost is that the handoff is a privileged core→in-tree-component pipe rather than something third parties can observe — which the proposal's non-goals already excluded.

**What was removed with it:** the `AgentEvents` member, `AGENT_EVENT_META` row, `EXTENSION_EVENT_VISIBILITY` row and the proposal/design/spec prose that described them. `log:entry` appears nowhere in the code today (`grep` finds it only in this file, as history).

**Kept from the episode:** option (c) itself — `emit` withholds internal events from wildcard fan-out, `INTERNAL_EXTENSION_EVENTS` is derived from `EXTENSION_EVENT_VISIBILITY` (one source of truth), wildcard delivery is therefore equivalent to `observeAny` by construction, and `agent-event-bus`'s single-wildcard invariant survives with the log extension as its subject. Its own recursion-guard justification is gone (D2 provides that now) and its remaining value is the original P1 one: those three events are UI deltas, not a stable observer contract.

### Group 4 — the log extension composition and the sink's home

- **`jsonl-file-sink.ts` is its own module, not part of `extension.ts`.** The sink is built from *both* sides: the extension attaches it, and `AgentLog.attachFileSink` delegates to it. Putting it in either would make the other import that module and close a cycle (`agent/agent-log ↔ agent/log`). It depends on `env` plus log types only, so both directions are legal.
- **`attachFileSink` / `getFileSinkDir` / `flush` / `flushSync` stayed on the seam** (task 4.7 originally said remove them). They are the surface `log-capture.mjs` and three log validators drive, so removing them would have rewritten six test files for no product change. The seam keeps the *handle*; the extension owns the *implementation*. `extension.ts` also composes rather than duplicates — the event→entry half was briefly re-implemented there before being replaced by a call into `bridgeTelemetryToAgentLog`, which is what makes `createLogExtension` mostly ``this is one feature`` glue.
- **`getFileSinkDir()` reads the **sink's** `dir`, not the options passed in.** First attempt recorded `options.dir` on the seam, which broke two validators for a real reason: an inert sink (env without `appendFile`) has no directory, but the seam reported one — and core uses that value to point a subagent's log at the parent's directory, so the subagent wrote nowhere while the parent said otherwise (`validate-agent-log-file-sink` asserting `null`, `validate-agent-log-host-sink` asserting the subagent file exists). Making `LogFileSink.dir` optional and absent on an inert sink fixed both without touching an assertion.
- **Wiring:** `AgentManager` builds the extension in its constructor (`getLogExtension()`), the extension owns the bridge subscription via `start()`, root sinks bind through `managed-agent.bindSessionLogSink()` → `getLogExtension().attachSink(...)`, and subagents bind through `logExtension.attachSink(subagentLog, …)`. Subagents matter here: they have no extension runner (`agent-factory.ts` creates one only for roots) yet do write logs, so the sink must be handed to each `AgentLog` by core rather than owned by a per-agent extension instance.
- **Open (group 5):** the sync exit flush is still the seam's (`flushLogOnDestroy` → `AgentLog.flushSync`). The extension's `dispose()` detaches sinks but is not yet wired into `destroyAgent`, and `registerExitFlush` does not exist — that is task 5.x.

### Group 5 — the contract, plus two inversions that did not fail on the first try

- **`registerFlush` is not `deactivate`.** Registration (context) and release (`deactivate`) are different moments, so the flush needed its own slot rather than being inferred from the presence of a `deactivate`. The runner runs it as an explicit phase (`flushExtension`) and reports a throw as `agent:extension-error` phase `flush`, mirroring the existing `activate`/`deactivate` reporting.
- **`registerExitFlush` is registered process-wide as well as per-instance.** The exit path that needs it most — a hard exit with a live session — never runs agent teardown, so there is no per-agent registry to consult. The instance keeps a disposer so `unregisterInstanceArtifacts` can release the process-wide registration; without that third field (`exitFlushRef`) a destroyed extension kept writing on `exit` (assertion 6 catches exactly this).
- **The log extension needed no new API for the exit path, but did need the old one repaired.** `AgentLog.flushSync()` → sink already gave the seam a sync exit path, and the guards already call it — so the log extension's *flush* was never the gap. What was broken is that the sink's exit registration had to be *released*, which is why `dispose()` now unregisters it.
- **Inversion results (the point of the exercise):** deleting the awaited flush from `destroyExtension` fails assertion 1 (`got deactivate`) — the ordering is real. Deleting `registerExtensionExitFlush(flushSinksSync)` from `start()` fails assertions 7a/7b (the sink's batch never reaches disk: `ENOENT`), and deleting the release from `unregisterInstanceArtifacts` fails assertion 6 (`['exit-writer']` where `[]` was expected). **Two of the three were only reachable after fixing the harness:** the first attempt at the harness began with a unit test and a `log.flush()` interleaving, and both let a broken guard pass; rewriting assertion 7 to use only the sync exit path (a 10s flush interval, so no timer can write it) is what made it bite.
- **Entry-schema enforcement landed here, not in group 4 (task 4.4).** The `log-extension` requirement says an entry that fails validation must be rejected rather than written, and nothing implemented that — the schema was only ever used by readers. `jsonl-file-sink` now validates before writing and reports the rejection. The trade-off is recorded in the code: a new `LogCategory` must be added to two lists, and missing the second now drops entries instead of writing them (the compiler cannot see the duplication).

### Group 2 — walked further than the task text, and found a second gap

- **2.1/2.2 deviation: `destroyAgent` kept its synchronous signature.** Task 2.2 offered "make `destroyAgent` async", but it has six call sites, including a `destroyAgent(id: string): void` member of `LocalAgentSessionHostManager` and two best-effort `try/catch` cleanups inside `runSubagent`'s `finally`. Making it async would either widen the interface or force callers to drop a promise. Instead the teardown sequence became a tracked promise (`pendingTeardowns`) with the log flush **chained onto its continuation**, so the order is unconditional while the signature is unchanged. `AgentManager.settleTeardowns()` exposes the await for ordered shutdowns and `LocalAgentSessionHost.destroy()` (already `async`) awaits it — which is what makes "`destroy()` resolves ⇒ the final batch is on disk" true for a fixture that asserts without polling.
- **2.1 scope: `emitSessionShutdown` was not awaited either.** The new destroy-order assertion failed at first, and the cause was not the flush: `emitSessionShutdown` discarded the interception promise (`.catch(() => {})`), so `destroyAll()` could unregister an interceptor whose async handler was still running. `AgentEventBus.intercept` is async by design and the hook's documented purpose is "so extensions can release resources (e.g. kill LSP daemons)" — a discarded promise makes that impossible. It is now `async` and awaited by the teardown sequence. Reverting it makes the assertion fail (verified by temporarily restoring the old body).
- **Test-fixture gap this surfaced:** the validator's hand-rolled CoreEnv lacked the **sync** fs primitives (`appendFileSync` / `mkdirSync` / `existsSync`) that the real Node env provides (`packages/node/src/environment/native-fs.ts:143`) and that `AgentLog.flushSync` prefers. Without them `flushSync` silently degraded to a fire-and-forget async flush, so the fixture was measuring the degradation path instead of production. The validator now builds its env through one factory that mirrors `@codent/node`, and the three copy-pasted inline literals collapsed into it.
- The ordering assertion lives in `validate-agent-log-host-sink.mjs` (this commit), so group 5 extends that coverage rather than duplicating it.

### Group 1 — scope kept to the plan

- `MAX_PENDING_LOG_ENTRIES` is exported (via `dev.mjs`) so the cap assertions assert the **real** constant rather than a copied magic number; a cap left at 0 makes both the retention assertion and the bootstrap-visibility assertion fail (verified), so neither is vacuous.
- The pending buffer is what makes the bootstrap ordering work **and** what makes the group-4 handoff safe: entries emitted before the extension attaches a sink are retained, then drained into the first sink that attaches. Without it the seam would have had to keep emitting into nothing between "the extension owns the sink" and "the extension is wired".

### Group 3 — superseded (see the group-3/4 note above)

The event-based handoff in this group's original tasks was withdrawn in group 4. The compile-guard findings recorded below are still accurate about the guard chain, but the `log:entry` declaration they describe no longer exists.

- **The layer-boundary gate moved a design decision.** `validate-layer-boundaries` rejected `log:entry` in `AgentEventPayloadMap` (`runtime-types` is the shared leaf); declaring it on `AgentEvents` was the correct response.
- **The guard chain did work, and was useful:** the registry key immediately produced three compile errors — `AGENT_EVENT_META`, `EXTENSION_EVENT_VISIBILITY`, and the rules table. That is the "adding an event is a deliberate act" property `extension-event-observation` claims, observed rather than assumed.
- **A wrong assumption of mine, caught by an assertion:** I first wrote that the bus wildcard excluded internal events. It did not — internal exclusion was an **extension-facade** property (`observeAny` expanding `observableExtensionEvents()`), and a raw `bus.on("*")` received `log:entry` like anything else. The assertion failed as soon as it was written. That finding is what produced option (c) (wildcard delivery withholds internal events), which was applied and kept even after the event was dropped.

### Group 4 — amended by user decision: wildcard delivery withholds internal events

A pre-implementation amendment proposed moving the log consumer onto `observeAny`, with core ending at zero wildcards. That was reviewed and **rejected in favour of amending the bus** instead, for a reason the reconnaissance had not surfaced:

- Option (b)/`observeAny` makes the **visibility table decide whether an event can be logged**, because the observable set and the rule table are different authority sets. They agree today (all three internal events carry no rule — verified), but nothing enforces the conjunction, so a future internal-classified event *with* a rule would silently stop being logged.
- Option (c)/amended bus keeps the rule table authoritative over logging, makes the recursion guard structural (`emit` cannot deliver the event to a wildcard at all), costs one subscription rather than ~50, and makes wildcard delivery **equivalent to `observeAny` by construction** (`observeAny` is already "wildcard over the observable set", so the two are now one semantic in one place).

Applied in this group (before 4b rewires the bridge):

- `agent-event-bus.ts`: `emit` consults `INTERNAL_EXTENSION_EVENTS` and skips wildcard fan-out for internal events. Typed observers still receive them, so internal narrows *how* an event is consumed, never *whether* it is emitted.
- `extension/types.ts`: `INTERNAL_EXTENSION_EVENTS` (a `Set`) derived from `EXTENSION_EVENT_VISIBILITY` — one source of truth, with the compile-time exhaustiveness check staying on the table. Exported from the same module so the bus imports it without creating a layer edge (`agent` is a single layer).
- Specs updated: `agent-event-bus` (internal exclusion + wildcard ≡ broad observation + one log consumer), `log-extension` (guard is structural, not handler-level; **and classifying an event `internal` while the rule table assigns it a rule is an inconsistency a validator must fail on** — the downside of (c), written down rather than glossed).
- `validate-extension-event-observation.mjs`: §6 asserts a wildcard listener never receives an internal event (`tool:chunk`/`tool:clear`/`extension:ui` — every member, not one example), and §5's source scan accepts either the bridge (pre-move) or the log extension (post-move) so it does not fail mid-change.
- Consequence for 4.5: the bridge's `bus.on("*")` is **moved**, not rewritten — the subscription mechanism is unchanged.
- **After the fact:** the event this guard was built for was removed (see the group-3/4 note), so option (c) survives on the wildcard≡`observeAny` property and the single-wildcard invariant rather than as a recursion guard. The `internal` × rule-table consistency assertion is still owed — see 5.7a.

**Validator gap still to close in 4b:** assert that no `internal` event carries an entry rule (`EXTENSION_EVENT_VISIBILITY` × `DEFAULT_EVENT_LOG_RULES`), since (c) makes that combination unsound. Tracked as task 5.7a.
