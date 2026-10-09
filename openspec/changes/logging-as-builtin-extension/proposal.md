## Why

`AgentLog` is the last cross-cutting concept that lives *inside* core instead of in a built-in extension, and logging is the only existing wildcard (`"*"`) bus consumer — which makes it the acceptance test for the observation surface added by `add-extension-event-observation`. Today core both *emits* log intent (69 direct `log.*` call sites across 20 files, plus the `ctx.logger` facade) and *owns* the formatting/persistence policy (a rule table, a JSONL sink, rotation), so "logging" cannot be understood or replaced without reading core internals.

## What Changes

- **Make the seam→extension handoff a direct injection** rather than a bus event. A `log:entry` event cannot be delivered to its only consumer (internal events are withheld from both wildcard delivery and the observation surface), and making it observable would make the recursion real. The sink is handed over by construction, so the guard is structural rather than a rule to remember.
- **Make `internal` mean "withheld from wildcard delivery"** as well as "withheld from the observation surface", so the classification means one thing on every subscription path and wildcard delivery is equivalent to `observeAny` by construction. This is what P1's visibility table was for; it is now also a bus guarantee. Consequence: an event classified `internal` must not carry an event→entry rule, since such a rule could never run (asserted by a validator).
- **Keep the emission seam non-removable.** `AgentLog` survives the refactor as a deliberately thin emitter (level/run filtering + envelope creation) that hands each entry to the sink the log extension built. ~69 core call sites stay untouched, because the three reasons for them are not refactorable: they are core diagnostics (compaction, stream recovery, memory, session recovery), they fire during bootstrap before any extension can be active, and extension failures must be loggable *before* the log extension exists.
- **Move policy into a built-in log extension** (`createLogExtension`): the event→entry rule table, message formatting, payload summarizing, the JSONL file sink, size rotation, session-boundary markers, and per-agent directory resolution.
- **Add an extension flush/teardown contract** (new capability): extension teardown becomes *awaitable* and extensions can persist pending state on the way out, with a synchronous best-effort path for process-exit. This is required, not optional: the log extension buffers entries behind a timer, so a fire-and-forget teardown silently drops the last batch (see design D4).
- **Fix two pre-existing defects found while scoping this** (landed as independently reviewable pre-commits):
  - `attachFileSink` never retains pre-attach entries, so all 15 `log.*` calls made inside `buildManagedAgent` — including **every extension load-failure warning** and the bootstrap summary — are silently discarded. `agent-log-timeline` claims bootstrap logging is "single-sourced"; the write half of that claim is currently a no-op.
  - `AgentManager.destroyAgent` calls `void runner.destroyAll()` without awaiting, then flushes the log sink immediately. Harmless today (the sink is a core object); once teardown is async and owns the buffer, it is a lost-write race.
- **BREAKING (internal/dev surface, not the published API):** `AgentLog` loses the sink/flush methods (`attachFileSink`, `getFileSinkDir`, `flush`, `flushSync`) — the log extension owns them. `AgentLog` is not in core's public export map (only `LogEntry`/`LogCategory`/`LogLevel` types and `installAgentLogProcessGuards` are), but the `dev.ts` surface and two validators (`validate-agent-log-file-sink`, `validate-agent-log-host-sink`) move with it.

## Capabilities

### New Capabilities

- `log-extension`: the built-in extension that owns log policy — entry intake from the seam's sink handle, the event→entry rule table and message formatting, payload summarizing, the JSONL file sink with rotation, per-agent log resolution, and durable teardown.
- `extension-teardown`: the contract by which extension teardown is ordered, awaited, and made durable — a flush/deactivate boundary that runs before core tears down the resources the extension writes through, plus a synchronous exit path.

### Modified Capabilities

- `agent-event-bus`: the "Wildcard subscription" requirement — internal events are withheld from wildcard fan-out (so the log consumer cannot observe its own write), wildcard delivery is equivalent to the broad observation surface, and the log consumer remains the one wildcard subscriber.
- `agent-log-timeline`: ownership and the write half of its claims — policy now lives in the log extension; the "bootstrap logging is single-sourced" requirement gains the currently-missing guarantee that pre-attach entries are not discarded; the persistence-only requirement gains a durability-at-teardown clause.
- `agent-lifecycle-events`: the requirements that name "the Event→Log bridge" as the sole core log path are restated against the built-in log extension (behaviour unchanged: still exactly one path per event, still no duplicate direct writes at emit sites).

## Impact

**Affected code**

- `packages/core/src/agent/agent-log/` — `agent-log.ts` becomes the thin emitter (sink/flush methods removed); the file sink moves to the extension.
- `packages/core/src/managers/telemetry/` — `event-log-bridge.ts` + `event-log-rules.ts` + `summarizePayload` move into the built-in log extension.
- `packages/core/src/agent/extension/` — `ExtensionRegistrations` / teardown gain the awaited flush boundary; runner stops being the only teardown owner (`destroyAll` must be awaited).
- `packages/core/src/managers/agent-manager.ts` — the bridge install site, and `destroyAgent`'s teardown ordering.
- `packages/core/src/managers/agent-factory.ts` — bootstrap log calls (15) gain a sink before they run, or the pre-attach defect moves rather than disappears.
- `packages/core/src/agent/log/*` — the log extension domain (`extension.ts`, `event-log-rules.ts`, `event-log-bridge.ts`, `jsonl-file-sink.ts`). No registry, meta or visibility entries: the handoff is not an event (D2).
- `packages/core/ARCHITECTURE.md`, `AGENTS.md` — the AgentLog / Event→Log bridge / `.agents/logs` contracts.
- `packages/core/scripts/` — `validate-event-log-bridge`, `validate-agent-log-file-sink`, `validate-agent-log-host-sink`, `validate-agent-log-timeline`, `validate-session-reuse-log`, `validate-middleware-log` (+ `helpers/log-capture.mjs`) move to the extension's surface; one new validator for the extension invariants. `packages/app/scripts/validate-core-imports.mjs` keeps `AgentLog` forbidden for app.

**Affected specs**

`log-extension` and `extension-teardown` (new); `agent-event-bus`, `agent-log-timeline`, `agent-lifecycle-events` (modified).

**Risk note.** The observable product contract (the `.agents/logs/<sessionId>/agent.log` JSONL schema, its fields, and the per-event mapping) is deliberately *unchanged* — 6 validators and the `write-extension` skill's debugging instructions depend on it. The risk is concentrated in ordering: nothing may log before the emission seam exists, and nothing may buffer past teardown. Both are pinned by validators rather than by comment.
