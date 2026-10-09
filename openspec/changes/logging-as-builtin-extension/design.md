## Context

`AgentLog` (`packages/core/src/agent/agent-log/agent-log.ts`) is a persistence-only timeline writer: it builds a `LogEntry` and streams it to whatever sink is attached — currently exactly one, the JSONL file sink created inside `attachFileSink` (`agent-log.ts:180`). It has **no in-memory buffer** (`validate-agent-log-file-sink.mjs:68` asserts pre-attach entries are dropped; the file *docstring* claiming backfill is stale).

Three things write entries:

| Path | Mechanism | Count |
|---|---|---|
| Direct `log.*` in core | `log.debug/info/warn/error/eventEntry` | **76** call sites across 22 files |
| Extension `ctx.logger` | `runner.ts:646-650` funnels into the same `AgentLog` | 7 extensions + memory/skill internals |
| Bus events | `bridgeTelemetryToAgentLog` — `bus.on("*")`, `event-log-bridge.ts:213` | the only wildcard consumer in core |

Both counts are regex measurements over `packages/core/src` (excluding the seam's own module,
`agent/agent-log/agent-log.ts`), not estimates: `\.(debug|info|warn|error|eventEntry)\(` with the
receiver read back from the prefix. The direct count includes optional-chain receivers
(`managed.log?.warn(`), which is why a plain `log\.` grep under-reports it. Re-measure before
trusting either number — the previous figures drifted for exactly that reason.

Policy lives in `event-log-rules.ts`: `TELEMETRY_EVENT_LOG_RULES` is typed `Record<keyof AgentEventPayloadMap, EventLogRule | false>`, so **every payload-mapped event must be classified at compile time** (`false` = deliberately not logged). Most events route through a rule; six need multi-entry custom handlers (session:mcp, memory:*, compaction:auto-*).

Anything that depends on this contract today: 6 validators (`validate-event-log-bridge`, `validate-agent-log-file-sink`, `validate-agent-log-host-sink`, `validate-agent-log-timeline`, `validate-session-reuse-log`, `validate-middleware-log`), the shared harness `scripts/helpers/log-capture.mjs`, the `write-extension` skill (which tells the model to read `.agents/logs/<sessionId>/agent.log` for `ctx.logger` output, `write-extension.md.ts:345`), `ARCHITECTURE.md` and `AGENTS.md`, plus 5 specs.

Also relevant, and constraining: `installAgentLogProcessGuards` (`lifecycle-guards.ts:72`) registers `uncaughtException` / `unhandledRejection` handlers that write a fatal entry to every registered `AgentLog` and then `process.exit(1)`. The observation surface added in P1 had to catch rejected observer promises specifically because that guard turns an unhandled rejection into a process kill. Any teardown design here has to respect the same guard.

## Goals / Non-Goals

**Goals:**

- One owner for log *policy* (rules, formatting, summarizing, sink, rotation, path resolution) — the built-in log extension.
- One non-removable *emission seam* that keeps the ~76 core call sites and `ctx.logger` working, including before extensions load and when extensions fail.
- Teardown that cannot lose buffered entries, with a synchronous path for hard process exit.
- The on-disk product contract (JSONL schema and the event→entry mapping) unchanged.
- Fix the two defects that a naive move would either preserve or make worse (pre-attach loss, unawaited teardown).

**Non-Goals:**

- Changing the JSONL schema, entry fields, categories, rotation limits, or the per-event mapping.
- Making the 76 call sites observable/interceptable by third parties, or making the log extension disableable (a disabled log extension would just re-create the always-on path).
- Extension packaging/trust (P5) or ordering (P3) — the log extension is in-tree and has no ordering requirement.
- Exposing log entries to the session/UI as a channel — `agent-log-timeline` forbids that and nothing here changes it.
- Redaction. There is no secret redaction in `AgentLog` today (only large-payload summarizing); adding it is a separate concern and out of scope, but the extension boundary is the natural place for it later.

## Decisions

### D1 — `AgentLog` stays, as a thin *seam* rather than an owner

The 76 call sites are not refactorable into events, for three independent reasons:

1. **Availability.** `agent-factory.ts:64-368` logs before `ExtensionRunner` exists (it is what *creates* the runner, at `:195`). An event emitted there with no subscriber is a silently dropped diagnostic.
2. **Bootstrapping.** `runner.ts:389` logs "Failed to activate extension …" — if logging required an active extension, a runner that cannot activate anything would also be unable to say so.
3. **Restart/recovery.** `run-stream-recovery.ts`, `capability-sanitize.ts`, `max-tokens-continue.ts` log mid-run failures whose whole purpose is post-mortem; routing them through a pluggable subscriber makes the diagnosis path pluggable.

So `AgentLog` becomes an emitter: it keeps level/minLevel filtering, `setRun`, envelope construction (`id`, `timestamp`, `error` shaping), and hands the assembled entry to the log extension's sink. Calls are **not** rewritten to `ctx.logger` — that would be a rename with no property gain, and would break the bootstrap ordering in (1).

*Alternatives:* (a) route every call site through `ctx.logger` — rejected, both because of bootstrapping and because `ctx.logger` funnels everything into one `hooks` category, losing the `category` axis the rules table depends on; (b) keep `AgentLog` as the owner and merely *allow* an extension to observe — rejected as a no-op refactor that leaves the concept in core.

### D2 — The seam→extension handoff is a direct injection, not a bus event

**Rejected (and this reverses the original design):** emitting a `log:entry` event and having the log extension subscribe to it. It cannot be delivered. The only two subscription surfaces are wildcard delivery and the observation surface, and D3 withholds internal events from *both* — so `log:entry` would have to be observable, which makes the recursion real rather than hypothetical: the log extension both produces and consumes the stream, so an observable entry event is a note written, observed, written again (line 59's worry, arrived at the other way round). Publishing a log entry to a surface extensions can see is also a payload/API commitment (a per-entry broadcast) that `agent-log-timeline` deliberately declines to make.

The seam therefore calls the sink the extension built: `AgentLog.attachSink({ handleEntry, flush, flushSync, dir? })`. Recursion is impossible **by construction** — the sink never emits, so there is no mechanism, not a rule to remember. The cost is that the seam is a privileged core→own-component pipe with no third-party-visible notification, which is the price of guarantee-by-construction; the log extension is in-tree by design (non-goal: third-party observability of the 76 call sites).

This also resolves the "emit into the bus or call a sink directly" open question, and it is why the seam keeps a thin `attachFileSink` convenience: the log validators and `log-capture.mjs` drive the seam directly, so the one-call way to persist a log must survive independently of the extension wiring.

### D2b — The log extension reuses the bridge's wildcard subscription; the rule survives with a new subject

`agent-event-bus` currently reads: "The Event→Log bridge SHALL be the only core wildcard consumer." After this change, the log subscription is still the only wildcard consumer, but it now lives in an extension. Two consequences:

- The requirement is restated to name the built-in log extension and to add the internal-event exclusion (D3, below). The *rule* survives; its subject changes.
- `validate-extension-event-observation` §5's source scan ("exactly one non-comment `.on("*")` in core, and it is `event-log-bridge.ts`") must be **updated, not deleted** — the invariant is that there is exactly one wildcard subscriber and it is the log extension. Deleting the scan would be exactly the rot it was written to prevent; moving it without re-deriving the expectation would let it pass vacuously.

### D3 — Wildcard delivery excludes internal events; the log consumer stays the one wildcard

`agent-event-bus` currently reads: "The Event→Log bridge SHALL be the only core wildcard consumer." The move raises the question of what the log consumer subscribes with.

**Verified constraint:** `DefaultAgentEventBus.emit` delivered to `node.wildcards` with **no visibility filter** (`agent-event-bus.ts:122`), while internal exclusion existed only on the extension facade, because `ctx.events.observeAny` expands `observableExtensionEvents()`.

Three options were weighed:

| Option | Recursion guard | Cost | Problem |
|---|---|---|---|
| (a) `bus.on("*")` + per-type rules | an unruled internal event is not formatted | 1 subscription | Safety rested on a table lookup staying `undefined`; a rule added later silently recurses |
| (b) `ctx.events.observeAny` | never in the observable set | ~50 subscriptions/agent | Visibility silently gates *whether* an event can be logged: an event classified internal **for observer-visibility reasons** stops being logged even if the rule table assigns it a rule (real today — `tool:chunk`/`tool:clear`/`extension:ui` are all internal *and* unruled, but nothing enforces that conjunction) |
| (c) **chosen** — `bus.on("*")`, and `emit` withholds internal events from wildcard fan-out | never delivered | 1 subscription | Widens what "internal" means: withheld from wildcard, since "internal" already means "caller must not observe" |

(c) is chosen because it makes the guard structural (`emit` cannot deliver the event at all), keeps the rule table authoritative over logging, and — the deciding detail — makes wildcard delivery **equivalent to `observeAny` by construction** rather than by coincidence (`observeAny` is already "wildcard over the observable set", so this is one semantic implemented in one place).

Consequences:

- The `agent-event-bus` requirement keeps its shape (wildcard exists; interceptor events excluded) and gains internal exclusion plus the wildcard≡broad-observation scenario; the single-consumer clause is restated as "the log consumer".
- The `log-extension` requirement becomes a *don't let the two tables disagree* invariant: classifying an event `internal` while the rule table assigns it a rule is unsound under (c), so it is a validator failure (asserted in the validator, and stated as a spec scenario).
- `validate-extension-event-observation` §6 asserts the exclusion directly (a wildcard listener never receives an internal event), and §5's source scan still expects exactly one wildcard consumer — now accepting either the bridge (pre-move) or the log extension (post-move), so it stops failing between the two.
- No migration to `observeAny`: the existing bridge's subscription is reused, so 4.5 becomes "move the subscription", not "rewrite it".

### D8 — The `internal` classification is a wildcard guard with no remaining member of its own

P1 introduced `EXTENSION_EVENT_VISIBILITY` with `internal` meaning "withheld from the extension observation surface", and its members were `tool:chunk`, `tool:clear`, `extension:ui`. D3 widens that to "withheld from wildcard delivery too", which was the point — but after D2 there is **no `log:entry` event**, so the widening has no member whose visibility is load-bearing for logging.

That is the honest summary of the change: the internal set and the bus behaviour are both still there and still tested, and their purpose is now the original one (cross-turn UI deltas and the extension UI pipe are not part of a stable observer contract) rather than a recursion guard. What made D3's option (c) attractive — making wildcard delivery equivalent to `observeAny` by construction — remains true and is asserted; the key-based exclusion it added is simply no longer what keeps logging safe (D2's construction is).

The carried invariant that *does* still bite: an event classified `internal` while the rule table assigns it a rule is unsound under (c), because the rule could never run. It is asserted in the validator.

A layer note from the implementation: `log:entry` was first placed in `AgentEventPayloadMap`, which required `runtime-types/agent-event-payloads.ts` to import `agent/agent-log/types.ts`. `validate-layer-boundaries` failed it — `runtime-types` is the shared **leaf**, and its one permitted `runtime-types → agent` edge is the `AgentUIChannel` port in `hosts.ts`. The gate was right; the declaration belonged on `AgentEvents` (a bus-internal notification, not a telemetry payload), which also kept it out of the compile-enforced rule table. Removing the event removed the question, and the layer constraint stays as it was.

### D4 — Teardown becomes awaited, and extensions get a flush boundary

Confirmed defect: `agent-manager.ts:369-375` emits `session:shutdown`, calls `void runner.destroyAll()` (**not awaited**), and then immediately calls `managedAgent.flushLogOnDestroy()`. Today this is benign because the sink is a core object flushed synchronously.

After the move, the log extension owns a `buffer` behind a 250 ms timer (`agent-log.ts:195,268-274`), so an unawaited teardown races: `deactivate()` may flush after the sink has been detached, or not at all. Even `await`ing `destroyAll()` is insufficient on its own — `AgentLog.flushSync()` is what makes hard `process.exit` lossless (`lifecycle-guards.ts:103`), and an async-only extension API cannot express that.

Design: the extension API gains an **optional async flush** (the extension's chance to land buffered state) which core runs in an awaited teardown phase *before* it releases the resources the extension writes through, plus a **synchronous flush registration** that the exit guard can call. Ordering must be: `session:shutdown` → awaited flush → then sink/dir release. Concretely, `destroyAll()` must be awaited by `AgentManager.destroyAgent`, and `flushLogOnDestroy()` must stop being the thing that races it.

*Alternatives:* (a) keep the sink in core and let the extension own only rules — rejected, that is most of the value of `log-extension` and leaves policy split across two owners; (b) make the log extension flush on every entry (no timer) — rejected as a performance regression the current design deliberately avoids.

### D5 — Directory resolution is injected, not discovered

`ManagedAgent.bindSessionLogSink()` (`managed-agent.ts:966-975`) currently computes `.agents/logs/<sessionId>` and calls `attachFileSink`; subagents add `{subagentId}.log` inside the *parent's* directory (`agent-manager.ts:218-221`). The extension cannot compute this itself — it needs the resolved session id (which is core's, not the extension's, and changes on restore). So core keeps the *resolution* (it knows the session identity) and passes it to the extension as a per-agent binding, while the extension keeps *what to do with it* (path shape, filename, rotation, boundary markers).

*Alternative:* let the extension read `ctx.cwd` and the session id from `ctx` — rejected: the extension api deliberately does not expose session identity, and adding it for this one consumer would widen the surface for no other use.

### D6 — Two defect fixes land as pre-commits, before the move

Both are independently verifiable and are *prerequisites*, not incidental cleanup:

- **Pre-attach loss.** `agent-factory.ts` logs 15 times before any sink exists, so extension load failures are invisible. Fix: make the seam hold the entries it is asked to emit until a sink attaches (a bounded pending buffer that is drained on attach), or attach a sink earlier in the bootstrap. The first is preferred — the second re-orders `ManagedAgent` construction. Note `validate-agent-log-file-sink.mjs:2`'s docstring already *claims* backfill, and `:68` asserts the opposite; the fix makes the code match the docstring and updates the assertion.
- **Unawaited teardown.** Fix as part of D4's ordering, but the `void runner.destroyAll()` → `await` change is reviewable on its own.

Both defects are stated in the proposal and pinned by tasks; neither is a silent drive-by edit.

### D7 — Teardown ordering: shutdown → awaited flush → sink release

`AGENT_EVENT_META` entries have an optional `channel`; nothing added by this change projects one. `agent-log-timeline` forbids a log channel to clients, and D2 already removed the event that would have raised the question — an event-per-log-entry broadcast is a payload and traffic regression that neither the seam-injection design nor the timeline requirement permits.

## Risks / Trade-offs

- **Ordering regressions are silent** (a lost entry looks like an event that never happened) → pin with validators that assert the *file* contents at each boundary: entry emitted before attach, entry emitted at teardown, entry emitted while extensions are failing. Existing file-sink and host-sink validators already read the JSONL back; extend them rather than trusting a counter.
- **Recursion via the event stream** → the bus withholds internal events from wildcard fan-out (D3), so the guard is structural rather than handler discipline, and it implies the invariant that an `internal` event must not carry an entry rule (validated). The classification itself is compile-checked (`EXTENSION_EVENT_VISIBILITY` is `satisfies Record<AgentEventType, …>`), and the validator asserts the exclusion directly.
- **The single-wildcard invariant is code-scanned** → the scan stays and now accepts the bridge (pre-move) or the log extension (post-move), so it does not fail mid-change; a second wildcard, or one outside those two, is the regression. Deleted instead, it would silently stop meaning anything.
- **Extension load failure now needs the log extension to have loaded** → still unsolved if the log extension itself is what fails. Mitigation: the seam is a core object that core instantiates unconditionally; the extension provides the *sink*, and if it never activates, entries remain in the bounded pending buffer and are flushed by the exit guard (or dropped with a bounded cap, never unbounded).
- **6 validators + `log-capture.mjs` move** → the risk is a validator that keeps passing against a symbol that no longer exists because it imports from `dist/dev.mjs`. Mitigation: change the imports and re-run the whole core suite, not just the touched files.
- **`installAgentLogProcessGuards` writes through the seam** → the guard must keep working when no extension is present; since it calls the seam (not the extension), this holds as long as D1 is respected.

## Migration Plan

1. **Pre-commit A** — pre-attach retention in the seam (defect fix, no policy move). Verify: `validate-agent-log-file-sink` (assertion updated), `validate-agent-log-host-sink`, full core suite.
2. **Pre-commit B** — awaited teardown (`await runner.destroyAll()` + ordering comment/assertion in `destroyAgent`). Verify: core suite + a teardown-ordering assertion.
3. **Not a bus event** — with `log:entry` dropped (D2), there is no registry entry, no `AGENT_EVENT_META` row and no visibility row. The internal-vs-rule consistency invariant (D3) is asserted directly by the validator instead. Verify: `validate-extension-event-observation` §5/§6 (one wildcard consumer; wildcard excludes internal events).
4. **Log extension** — `src/agent/log/` owns rules/formatting/summarizing (`event-log-bridge.ts`, `event-log-rules.ts`, moved with history) and the sink (`jsonl-file-sink.ts`); `createLogExtension` composes them, `AgentManager` installs it, and the seam's sink handle is what the extension attaches. The bridge install moves out of `AgentManager`'s constructor and into the extension. Verify: all 6 log validators on the new surface + full core suite.
5. **Flush/teardown contract** — extend the API, wire the exit guard's sync path, extend the teardown validator. Verify: full suite + a lost-entry-at-teardown assertion.
6. **Docs** — `ARCHITECTURE.md`, `AGENTS.md`, `write-extension` skill (the `.agents/logs` debugging instruction stays valid; the "Event→Log bridge" vocabulary changes).

Rollback: each commit is independently revertible; step 4 is the only one that is behaviourally load-bearing for the product contract, and it is verified against unchanged JSONL output.

## Open Questions

- **Resolved: does the seam emit into the bus, or call a registered sink directly?** Direct injection (D2). The bus was rejected because the event cannot be delivered to its only consumer, and the latency argument is moot once the mechanism is a function call.
- **Should the log extension be "built-in but visible"?** It must not be disableable (that would remove all persistence), but whether it appears in extension-management listings (`ctx.extensions.list()`) is a product decision that affects `extension-ui`-adjacent surfaces.
- **Bounded pending buffer cap** before a sink attaches (defect fix A): the current design drops everything; a cap trades unbounded memory for a fixed-size diagnostic window. The right number is an empirical question against a bootstrap that today emits ~15 entries.
- **Vocabulary debt in `agent-lifecycle-events`.** Two requirement *names* contain "Event→Log" ("Approval requests log only via Event→Log", and its sibling's prose), which is stale once the bridge is an extension. This change modifies their bodies but deliberately keeps their names so the delta folds cleanly as `MODIFIED`; renaming would require a `RENAMED` operation and risks mangling the archive fold. Decide whether to rename in a follow-up docs change or to treat the requirement name as a stable identifier whose prose carries the live meaning.
- **Is the log extension listed in extension-management output?** It must not be disableable, but whether it appears in `ctx.extensions.list()`-style surfaces is unresolved (see D1's visibility question).
