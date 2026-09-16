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

### D5: No SDK version bump

**Decision.** Stay on `@tanstack/ai@0.53.0`.

**Why.** `0.54.0`'s structured-output change (#1340) reorders the native structured result
to be emitted *before* `RUN_FINISHED`. The port reads the object from
`structured-output.complete` and does not depend on its position relative to
`RUN_FINISHED`; usage is read from `RUN_FINISHED` independently. Neither guarantee is
violated by the current ordering, so the bump buys nothing here and would be an unrelated
change to package.json and the lockfile.

### D6: Validation failures surface as thrown errors, callers own the fallback

**Decision.** The port throws when the model output does not satisfy the schema. Each
memory caller catches and degrades: retrieval → `selectWithKeywords`; extraction → zero new
memories; consolidation → no change.

**Why.** The three callers already have different, correct fallbacks. A single
"return null on failure" contract inside the port would push the same decision into the
port and force it to guess which fallback applies.

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

## Open Questions

- Should extraction keep its "prefer capturing rather than skipping" bias once entries that
  fail the schema are dropped rather than coerced? The current code coerces (defaults
  `type` to `"user"`), so a stricter schema shifts the bias toward skipping.
- Is a per-call `maxOutputTokens` bound sufficient, or does extraction need a post-validation
  entry cap to avoid a schema-valid but oversized result?
