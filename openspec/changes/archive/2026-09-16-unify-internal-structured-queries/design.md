## Context

`chat()` in `@tanstack/ai@0.53.0` supports structured output through a single option,
`outputSchema`. Its runtime dispatch is:

| call shape | returns |
|---|---|
| `chat({ outputSchema })` | `Promise<T>` — the validated object, **nothing else** |
| `chat({ outputSchema, stream: true })` | `StructuredOutputStream<T>` — chunks plus a terminal `structured-output.complete` CUSTOM event carrying `{ object, raw, reasoning? }` |
| `chat({ stream: false })` | `Promise<string>` |
| default | `ChatStream` — what `AgentRunner` and `runSideTextQuery` use today |

Two facts drive this design and were verified against the installed package source
(`node_modules/.pnpm/@tanstack+ai@0.53.0_.../src/activities/chat/index.ts`):

1. **The `Promise<T>` path discards usage.** `runAgenticStructuredOutput` ends with
   `return result.data` and never surfaces the adapter's `usage` to the caller. Only the
   `stream: true` path forwards it (`fallbackStructuredOutputStream` spreads
   `result.usage` into `RUN_FINISHED`).
2. **The `Promise<T>` path is not iterable.** Our internal-query port returns values that
   callers may consume incrementally, and the subagent/runner plumbing calls
   `assertAsyncIterable` on whatever the port hands back.

We already have a one-shot internal-query port — `runSideTextQuery` — with four callers
(session titles, session summaries ×2, memory retrieval). Everything this change needs can
live behind that port; the agent run loop does not have to be touched.

## Goals / Non-Goals

**Goals:**

- One place where an internal caller says "give me this shape" and gets a validated object
  back, with usage and abort handling already correct.
- Delete every regex-based JSON recovery in the memory subsystem.
- Make the memory LLM contract exist once (as a schema) instead of three times (prose in
  the system prompt, a hand-written interface, a regex parser).
- Keep the memory subsystem's existing failure behaviour: no schema failure may reach the
  conversation or abort a turn.

**Non-Goals:**

- Structured output for the conversational run loop. Explicitly excluded; see Decisions.
- Changing the rendering, persistence, or windowing of `StructuredOutputPart`. The message
  layer already has partial awareness of it (`empty-assistant-shell.ts:9`,
  `session-sync-tracker.ts:86,141`) but nothing produces one, and nothing in this change
  starts producing one.
- Bumping `@tanstack/ai`. See Decisions for why `0.54.0` is not required.

## Decisions

### D1: Drive structured queries with `stream: true`, not `Promise<T>`

**Decision.** The port calls `chat({ outputSchema, stream: true })` and reads the object
from the terminal `structured-output.complete` event.

**Why.** It is the only path that preserves usage (Context, fact 1), and it keeps the
returned value iterable (fact 2), so the port's shape stays close to `runSideTextQuery`'s
existing contract instead of becoming a second, non-iterable kind of result.

**Alternative considered.** `Promise<T>` — simpler call site and the engine validates
internally. Rejected: it silently loses usage, which would make internal structured calls
invisible in the cost/usage graph. Note this is a deliberate asymmetry in the SDK — the
`Promise<T>` path validates with Standard Schema and the streaming path does not, so the
port validates explicitly on the streaming path.

**Invariant this creates.** The port MUST fail when usage is unavailable in a way callers
can observe, rather than returning a result that silently skipped accounting.

### D2: Extend the existing port rather than introduce a new one

**Decision.** Add a structured variant beside `runSideTextQuery` in
`models/adapter/side-text-query.ts`. The four existing text callers are untouched.

**Why.** The one-shot internal query port already exists and already solves abort
plumbing, thinking-disable per model style, usage recording, and `durationMs`. A second port
would duplicate all of it and drift.

**Alternative considered.** A standalone `models/adapter/structured-query.ts`. Rejected:
the abort/usage/thinking logic is the non-trivial part and is identical.

### D3: Move memory extraction and consolidation off the subagent path

**Decision.** `extractMemories` and `consolidateMemories` call the one-shot port instead of
`runSubagent`.

**Why.** They are already one-shot queries wearing a subagent costume — `tools: {}`,
`maxIterations: 1`, `bridgeUI: false`, `autoDestroy: true`. Reaching structured output
through the subagent path would mean threading a schema through five layers
(`SubagentConfig` → `run-agent-skeleton` → `run-agent` → `AgentRunnerRunInput` → `chat()`)
and then defeating two things that exist on that path specifically to shape *text* output:

- `truncateSummary` with a finite `maxOutputLength` (`memory-extractor.ts:192`, `:306`) —
  a truncated JSON payload is unparseable, which is exactly the failure mode that makes
  the current regex parsers look robust.
- `applySubagentCancelNotice` (`subagent-output.ts:36-45`), which appends
  `[Task cancelled by user.]` to aborted runs — invalid JSON by construction.

Collapsing to a one-shot also lets `extractAssistantText` stay text-only; nothing needs to
teach it to read `structured-output.complete`.

**Accepted cost.** Two observable changes, recorded as spec deltas:

- The subagent panel loses the `memory-extract` / `memory-consolidate` rows.
- Their usage moves from `aggregateUsageToParent` to the shared usage history that
  `runSideTextQuery` already writes. Net effect on the cost graph is neutral — the tokens
  are still counted, just against the internal side-query contributor instead of the parent
  run.

**Alternative considered.** Keep the subagent path and add a structured channel to it.
Rejected for this change: the five-layer thread plus the truncation/cancel-notice
suppression is a large blast radius for calls that never wanted tools, phases, or a UI row.

### D4: The exclusion of the conversational run loop is a decision, not a deferral

**Decision.** `AgentRunner` / `SubagentConfig` do not gain an `outputSchema` here.

**Why.** A structured result produced *inside a conversation* enters the transcript as a
`StructuredOutputPart`, and that part has to be handled by every consumer: the three host
renderers, compaction, the session-sync fingerprint, the empty-shell detection, and the
message windowing. That is a materially different and larger change than "internal callers
get a parsed object", and bundling it would make this change unreviewable. The message
layer's partial existing awareness of the part type is a starting point, not a completed
integration.

### D5: Upgrade to `@tanstack/ai@0.54.0` first

**Decision.** Bump `@tanstack/ai` to `^0.54.0` (all three declaring packages) together with
its adapters, as the **first** step, before any port work.

**Why the earlier "no bump needed" reading was wrong.** `0.54.0`'s #1340 has two parts:

1. *Ordering.* In `0.53.0` the model terminal is **deferred** — the engine pushes
   `RUN_FINISHED` onto `deferredModelRunFinishedChunks` and flushes it later, while the
   structured result travels out-of-band via `structuredOutputResult`. A consumer can
   therefore observe `RUN_FINISHED` before it has the object.
2. *Failure semantics.* `0.54.0` makes parsing failure emit **only** `RUN_ERROR`.

The spec's "Internal query failures are observable" requirement depends on a failure being
reliably identifiable. Under `0.53.0` that is exactly the guarantee in question, so the bump
is load-bearing for this change rather than unrelated.

**Adapters move with it.** `@tanstack/ai-openai@0.22.6`, `@tanstack/ai-anthropic@0.18.6`, and
`@tanstack/openai-base@0.10.11` all declare `peerDependencies: { "@tanstack/ai": "^0.54.0" }`,
so bumping the engine alone produces a peer conflict. `@tanstack/ai-code-mode` and
`@tanstack/ai-mcp` are bumped in the same pass (agreed: one wave) even though they are not
structured-output related.

**Release-age policy.** `pnpm-workspace.yaml` carries a `minimumReleaseAgeExclude` list of
`@tanstack/*` exceptions. If the configured age threshold exceeds the time since 0.54.0's
release (2026-09-10), an exception must be added or the install will refuse the version.

**Regression risk.** 0.54.0 also changes agent-loop event delivery ("wait for the active
subscriber to process all events before resolving send"). This repo has substantial custom
stream handling (`packages/core/src/agent/stream/`, plus suppression/recovery middleware), so
the existing stream validations must be run against the upgraded tree before port work
begins — the upgrade is the riskiest step in this change, not the memory migration.

### D5b: Structured output is an overload on `runSideTextQuery`, not a new function

**Decision.** `runSideTextQuery` gains an optional `outputSchema`. When it is passed the
function returns the structured result; when it is omitted the existing text result is
returned. The two are expressed as **TypeScript overloads** so the four existing callers need
no change at all.

**Why overloads over a union return.** A union return would force every existing caller to
narrow a value that is statically known at their call site. Overloads keep the text path
byte-identical in type terms and confine the new shape to the calls that ask for it.

### D6: Validation failures surface as thrown errors, callers own the fallback

**Decision.** The port throws when the model output does not satisfy the schema. Each
memory caller catches and degrades: retrieval → `selectWithKeywords`; extraction → zero new
memories; consolidation → no change.

**Why.** The three callers already have different, correct fallbacks. A single
"return null on failure" contract inside the port would push the same decision into the
port and force it to guess which fallback applies.

### D7: The port owns failure logging; success is silent

**Decision.** The port takes an optional `log?: AgentLog`, logs warnings under a new
`side-query` category on transport/model failure and on schema-validation failure, and
writes nothing on success. A caller may still degrade, but not silently.

**Why.** `side-text-query.ts` currently has no logger and no logging call — its only
log-adjacent line is `debug: false`, which exists to keep TanStack's console dumps out of
the Ink TUI. The consequences today:

- `session-service.ts` `generateSessionTitle` has a bare `catch {}`, so a failed title
  generation leaves no trace anywhere.
- TanStack emits `RUN_ERROR` as a **chunk**, not a throw. A consumer that does not convert it
  never reaches a catch block, so without the port logging it the failure is unobservable.
- `memory-retrieval` logs its own parse failures but loses the reason for a request-level
  failure, because the error thrown by the port is flattened into one coarse line at the
  caller.

Putting this in the port (rather than in each of the four callers) means one contract covers
all of them plus the structured variant they will share.

**On the new category.** `LogCategory` is declared twice — a TS union in
`agent-log/types.ts` and a zod enum in `agent-log/schemas.ts`. Nothing enumerates the union
exhaustively (verified: no zod mirror elsewhere, no exhaustive switch), but a category
missing from the zod enum fails at write time. The name `side-query` reuses the label the
usage history already records for these calls (`agentId: "side-query"`), so logs and usage
agree.

**Alternative considered.** Reuse an existing category (`llm` or `memory`). Rejected: the
port serves memory, session titles, and session summaries alike, so filing under any
caller's category would misattribute two thirds of its entries.

**Alternative considered.** A caller-supplied `category` parameter. Rejected: the port has
one identity, and making the category a per-call knob invites drift for no benefit.

**Measured during implementation.** Two facts that only surfaced by running the code, both
of which changed the implementation:

- The consumer never sees `chunk.error`. The engine normalizes the adapter's failure onto the
  chunk's **top-level `message`** (probed: an adapter yielding
  `{ type: "RUN_ERROR", error: new Error("provider exploded") }` arrives as
  `{"type":"RUN_ERROR","message":"provider exploded"}`). Reading only the declared `error`
  field degrades every failure to a generic string, so the port reuses the repo's existing
  `extractRunErrorMessage`, which prefers `message`.
- A schema failure does not reach the port's own validation. 0.54.0 reports it as a
  `RUN_ERROR` chunk instead (the #1340 fix), so the missing-object branch is a backstop rather
  than the main path. The validation assertion in the task list was rewritten to assert "it
  throws, with a reason" rather than matching the port's own fallback wording — otherwise the
  test would have been green only against a string the engine never lets it produce.

### D8: Deleting subagent surface — dead code vs single-consumer

**Decision.** After memory leaves the subagent path, a `SubagentConfig` option is removed
only when its reference count drops to **zero**. An option left with a single consumer
(`auto-compact`) is kept.

**Why this needs stating.** Two of memory's options were the *second* consumer of a feature
that still has one, which makes "memory no longer uses this" a misleading reason to delete.
Applying the rule:

| Option | References after | Verdict |
|---|---|---|
| `aggregateUsageToParent` | 1 (`auto-compact.ts:278`) | keep |
| `maxIterations` | 1 (`auto-compact.ts:275`) | keep |
| `bridgeUI` | 1 (`auto-compact.ts:280`; memory only used the default) | keep |
| `MEMORY_EXTRACT_MAX_OUTPUT_LENGTH` / `MEMORY_CONSOLIDATE_MAX_OUTPUT_LENGTH` | 0 | **remove** |
| The `AgentManager` forwarding chain | 0 | **remove** |

**Consequence to watch.** Memory's `autoDestroy: true` / `aggregateUsageToParent: true` were
**redundant defaults** — `run-subagent.ts:90-91` already default both to `true`. The usage
re-attribution described in D3 therefore shows up as the parameters *disappearing*, not as a
`true → false` flip, so it is invisible in a diff and must be verified against the real usage
graph instead.

**Also explicitly not dead.** `description` is not a memory leftover: `compaction`,
`progress-summary`, and `task-prefork` still set it, and no core logic branches on its value
(it feeds the `subagent:started` telemetry message at `event-log-rules.ts:257` and the app-side
row label at `subagent-status.ts:35`). `run-subagent.ts` also contains **no** empty-tools
special case written for a tool-less worker, so there is no branch to remove there.

**Removing a public export.** The two `MEMORY_*` constants are re-exported from
`packages/core/src/index.ts:201-204`, so deleting them is a public API change. The package is
0.0.1 and unpublished, so no deprecation shim is warranted, but the removal is called out
rather than done silently.

### D9: This migration lands without regression cover

**Decision.** Add one minimal validation to the memory check-in, because the existing suites
do not touch this path at all.

**Landed as `validate:memory-llm-contract`** (`packages/core/scripts/validate-memory-llm-contract.mjs`),
which drives extraction and consolidation through a fake structured adapter and asserts: the
entries the model returned are written (importance kept, `expiresAt` normalized to ISO), an
out-of-range importance / unparseable expiry is *normalized away rather than fatal*, an unknown
memory type is *rejected rather than defaulted to `user`*, a transport or schema failure yields
zero memories (and no change, for consolidation) with the store untouched, and consolidation
applies merges plus deletions. Four mutations were used to prove the assertions bite: dropping
the `expiresAt` transform, letting the type fall back to `user`, recovering entries from a
schema-invalid response, and returning the raw object instead of the transformed one.

**Implementation note: the no-adapter case is a skip, and a resolve failure is not.** With no
provider configured, extraction skips (`skip-no-adapter`) rather than reporting a memory error.
But `resolveTextAdapter` is also where a genuine resolution failure lands, and letting that
throw keeps the extraction slot releasable: the `finally` block that clears
`extractionInProgress` runs on the failure path, so a broken provider cannot wedge every later
turn's extraction. It still never reaches the conversation.

**Why.** `validate-memory-service`, `validate-memory-lifecycle`, and
`validate-memory-extension` contain no reference to `runSubagent`, `extractMemories`, or
`consolidateMemories`. Deleting the forwarding chain and the public constants can therefore
break nothing that any existing test observes; `pnpm typecheck` catches dropped call sites but
not behavioural regressions.

**Mitigation.** A focused check that extraction returns 0 (rather than throwing) when the
schema is unsatisfied — the one new failure mode this change introduces — so the fallback
contract in the spec has at least one executable guard.

### D10: Schema failure granularity — all-or-nothing, and never partially applied

**Decision.** The collection-level `.catch([])` is **not** used on either memory contract.
A response that fails validation is rejected whole, and no part of it is applied.

**Why this needed deciding.** The first implementation carried a `.catch([])` on
`consolidationSchema.merged` / `.deleted`. In zod, `.catch()` on an *array* replaces the
entire array when any element fails — without throwing. The caller then ran the deletions
anyway, so a merge that failed validation still deleted the files it named in `replaces`:
reproduced with three memories, an invalid `merged[0].type`, and `deleted` listing all three,
the result was `changed: true, count: 0` with every file gone and **nothing logged** — the
only copy of each memory destroyed. This is exactly the "half-applying a failed response"
the surrounding code comment claimed to prevent, and it made schema failure indistinguishable
from a legitimate empty decision.

**The asymmetry is deliberate.** Consolidation and extraction are both all-or-nothing, but for
different reasons and with different shapes:

- *Consolidation* rejects a partial **application** because applying `deleted` without `merged`
loses data. `merged` / `deleted` are required (no `.optional()`, no default), and a merge's
`replaces` is required too — a merge that does not name its sources would leave both copies on
disk.
- *Extraction* rejects a partial **response** rather than skipping the bad entry. Honouring
"prefer capturing rather than skipping" would mean per-entry recovery, which would also hide a
model that systematically emits one bad field: it would produce *no* memories while looking
successful. A visible zero, with the offending path in the log, is the failure mode worth
having. The trade-off is real and accepted: one bad entry costs the good ones with it.

**Field-level `.catch` is still right for the optional hints.** `importance` / `expiresAt`
normalize instead of rejecting, because they are optional hints rather than the result itself —
dropping one cannot lose data, and failing a whole entry over a stray importance value would.

**Never indistinguishable from success.** Because `.catch([])` also made an unrecognized
top-level shape (`{}`) read as "nothing to do", the required-collection shape is asserted
explicitly, and the validation message now carries the issue **path** (`merged.0.type`), which
is the only diagnostic a background extraction gets.

**Proven by.** `validate:memory-llm-contract` cases 6 and 7, plus mutations that restore
`.catch([])` and that let `type` fall back to `user`; both make the script fail. The earlier
mutation set did **not** catch this, because the two mutations that looked like they covered
`type` rejection only exercised the extraction path — the consolidation path's `.catch`
swallowed them first.

### D11: The output-token cap must be spelled per adapter

**Decision.** `runSideTextQuery` maps `maxOutputTokens` to `max_completion_tokens` for
openai-style adapters and `max_tokens` for anthropic, instead of the generic `maxTokens`.

**Why.** `modelOptions` is spread verbatim into the provider request body, and the adapters
deliberately do not read a generic spelling — the SDK's own sampling-keys list annotates
`maxTokens` as "generic / migration leftover (no adapter reads it)", and
`@tanstack/openai-base`'s chat-completions adapter notes the root
`temperature`/`topP`/`maxTokens` fields are "intentionally NOT read". Measured against a local
mock endpoint, the old code put `{"maxTokens":20}` on the wire and nothing else: the cap was
a no-op for every one of the three structured callers (extraction 2000, consolidation 4000,
retrieval 256), which removed the only mitigation design.md listed under Risks.

The migration made this a **capability regression**, not a pre-existing quirk: the subagent's
`maxOutputLength` was a real character-level truncation, whereas the token parameter it was
replaced with did nothing at all.

**Scope.** Fixed in both call sites via one shared helper (`models/max-tokens-option.ts`):
`runSideTextQuery` and `AgentRunner`. The run loop's cap is not cosmetic —
`max-tokens-continue` escalates it to 64k on truncation, and that escalation was a no-op
while still logging "Output truncated — escalating max_tokens". The helper exists so the two
sites cannot drift again, and both the run loop's key and the helper itself are asserted.

### D12: The output schema is a response filter, not a request constraint

**Decision.** Every prompt that pairs with an `outputSchema` must state the full field contract
the schema enforces. The schema validates; it does not instruct.

**Why this needs stating explicitly.** D1/D5b assumed `outputSchema` would constrain the model.
Measured against the configured provider it does not: a prompt that contradicts the schema wins,
and malformed output reaches the consumer unchanged. So the schema acts purely as a filter on
the response, and the prompt is the only thing telling the model what to emit. A field the
schema requires but the prompt never mentions is a field the model has no reason to produce —
and with an all-or-nothing contract (D10), every such reply is rejected whole.

**This bit precisely once.** Rewriting `CONSOLIDATION_SYSTEM_PROMPT` dropped the JSON skeleton
that used to spell out `"type": "user|feedback|project|reference"`, replacing it with "Field
notes" that covered every field *except* `type`. The schema still required `type` as a strict
enum, so consolidation went from 3/8 to 5/8 of live replies being rejected — with the old regex
path having accepted them by falling back to `"user"`. The regression was invisible to the
fixtures, which always included `type`.

**Guarded by.** `validate:memory-llm-contract` case 1b asserts each prompt introduces its
required fields *as fields* (`- name:` for extraction, `"name":` for consolidation) with `type`
stated alongside its four allowed values. The first version of that assertion only checked
`prompt.includes("type")`, which passed even after the contract was deleted — the preamble
"(filename, name, type, description)" and rules like "preserve user preferences" mention the
word incidentally. It now requires the field-shaped form, and the mutation that restores the
broken prompt fails it.

## Risks / Trade-offs

- **[Loss of abort propagation nuance]** The subagent path currently aborts via the parent
  cascade (`ManagedAgent.abort` → child agent). The one-shot port takes an `abortSignal`
  and forwards it, but retrieval is the only caller passing one today; extraction and
  consolidation will need a signal threaded from the turn that triggered them.
  → Mitigation: make `abortSignal` an explicit parameter of the migration tasks, and test
  that an aborted extraction leaves the turn unaffected.

- **[Loss of the subagent output budget as a guard]** `maxOutputLength` currently caps how
  much text these calls can produce. A schema permits a large array.
  → Mitigation: keep a `maxOutputTokens` bound on the port and, for extraction, cap the
  number of accepted entries after validation rather than by truncating the payload.

- **[Silent accounting regression]** If the port is implemented against the `Promise<T>`
  path by accident, usage disappears without any test failing unless it is asserted.
  → Mitigation: the spec requires usage to be returned; add a validation script asserting a
  structured query records usage in the shared history, and a mutation test that fails when
  usage is dropped.

- **[Failure visibility is only as good as the log handle]** The new warnings reach disk
  only when a caller passes a log. Three of the four callers have none today, so the
  threading task (`SessionHost` → `SessionPersistInput` → the port) is load-bearing; skipping
  it yields a port that can log but never does.
  → Mitigation: log threading is its own task group, and the acceptance check asserts a
  failure entry actually lands in the JSONL sink rather than only that the call was made.

- **[Success is intentionally silent]** Because only failures are logged, a side query that
  returns a wrong but schema-valid answer produces no entry. This is the accepted cost of
  the no-noise trade-off, not an oversight.
  → Mitigation: none required; noted so a later reader does not "fix" the silence by adding
  per-call info lines.

- **[Model/provider schema support]** `supportsCombinedToolsAndSchema` gates the
  tools+schema combination, and it is model-dependent (Anthropic: Claude 4.5+ only; Groq:
  explicitly `false`). These calls pass no tools, so they take the engine's structured-output
  fallback path and are not gated by it — but a provider that cannot do JSON schema at all
  would fail the query outright.
  → Mitigation: D6 already requires callers to degrade; the retrieval keyword fallback
  doubles as the compatibility path.

- **[Behaviour drift in what counts as a valid memory]** Tightening the contract into a
  schema may reject entries the current `typeof` checks accepted (for example an entry with
  an unknown `type`, which today is silently coerced to `"user"`).
  → Mitigation: this is a deliberate tightening, recorded in the spec; tests must pin both
  the rejection and the surviving fallback.

## Migration Plan

1. Add the structured variant to the port; no caller changes yet. Validate it against a
   schema with a real adapter and assert usage is recorded.
2. Migrate retrieval (smallest blast radius, has an existing fallback). Delete its regex.
3. Migrate extraction and consolidation; delete `parseJsonArray`,
   `parseConsolidationResponse`, `ExtractedMemory`, `ConsolidationDecisions`; update
   `memory-service.ts` call sites and drop the now-unused `AgentManager` parameters.
4. Re-run the memory validate scripts and the core typecheck; confirm the subagent panel
   change and the usage-graph change are the only observable differences.

Rollback: steps 1–3 are independent commits. Reverting step 3 restores the subagent path
without touching the port; reverting step 2 and then 1 removes the capability.

Logging is deliberately the **first** step, before any memory migration: it is the change
that makes the later migrations debuggable, and without it a schema-validation failure
introduced in step 3 would be visible only as "memory stopped working".

Subagent surface cleanup (D8) is the **last** step and must run only after the memory
migration is verified. Doing it earlier would delete the options the migrating call sites
still pass.

## Open Questions

- Should extraction keep its "prefer capturing rather than skipping" bias once entries that
  fail the schema are dropped rather than coerced? The current code coerces (defaults
  `type` to `"user"`), so a stricter schema shifts the bias toward skipping.
- Is a per-call `maxOutputTokens` bound sufficient, or does extraction need a post-validation
  entry cap to avoid a schema-valid but oversized result?
