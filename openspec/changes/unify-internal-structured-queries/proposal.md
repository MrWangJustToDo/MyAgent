## Why

The repo's internal, non-conversational LLM calls (memory retrieval / extraction /
consolidation, session-title and summary generation) all ask the model for JSON through
prose instructions, then recover it with hand-written regexes. Those parsers are the
fragile part: `parseJsonArray` and `parseConsolidationResponse` use greedy
`/\[[\s\S]*\]/` and `/\{[\s\S]*\}/` (a bracket inside the body over-matches), while
`memory-retrieval`'s `/\{[\s\S]*?\}/` is lazy (a nested object under-matches and truncates).

`@tanstack/ai@0.53.0` already ships the capability that removes the guesswork:
`chat({ outputSchema })` converts a Zod schema to JSON Schema for the provider, validates
the result, and normalizes it. We use `outputSchema` only on `toolDefinition` (tool
*output* schemas); there is no `chat({ outputSchema })` call site. The structured-output
validation fix we previously noted (optional fields widened to `required` + nullable by
strict mode, then rejected as `null`) landed in `@tanstack/ai@0.34.0` and is present in
the version we run, so the previously-blocking reason to wait no longer applies.

## What Changes

- Add a **structured one-shot query** capability to the internal-query port: a variant of
  `runSideTextQuery` that takes a Zod schema and returns the **validated object** alongside
  `raw` text, token `usage`, and `durationMs`.
- Give the port **failure visibility**. It currently has none: `side-text-query.ts` carries no
  logger at all, so a request-level failure is invisible — and one of its four callers
  (`session-service.ts` `generateSessionTitle`) swallows it with a bare `catch {}`. The port
  gains an optional log handle, a dedicated `side-query` log category, and warnings for both
  transport errors and schema-validation failures. Success stays quiet to avoid per-call
  noise.
- Internally drive it with `chat({ outputSchema, stream: true })` and read the object from
  the `structured-output.complete` CUSTOM event. The explicit `stream: true` is required for
  two independent reasons: it is the only mode that forwards token usage, and it keeps the
  returned value iterable so it fits the existing port's shape.
- Migrate **memory retrieval** (`selectWithLLM`) to the new variant and delete its regex
  parser. Its existing `selectWithKeywords` fallback stays and now also covers validation
  failures.
- Migrate **memory extraction** and **memory consolidation** off the `runSubagent` path onto
  the one-shot port, and delete `parseJsonArray` / `parseConsolidationResponse` plus the
  duplicated `ExtractedMemory` / `ConsolidationDecisions` interfaces. The JSON contract is
  expressed once, as a Zod schema, and reused for both the provider request and validation.
- Accept the two consequences of that migration explicitly: internal memory workers stop
  appearing in the subagent panel (their `description` rows), and their token usage moves
  from parent aggregation to the shared usage history that `runSideTextQuery` already
  records.
- **Not** changing the agent run loop (`AgentRunner` / `SubagentConfig` / `run-subagent`).
  Structured output for a *conversational* run, where the result enters the transcript and
  every host must render it, is deliberately out of scope — see design.md for the concrete
  blockers that make it a separate change.

## Capabilities

### New Capabilities

- `internal-structured-query`: the one-shot structured query port — schema in, validated
  object plus usage out, with an explicit fallback contract for validation failure.
- `memory-llm-contract`: memory extraction, consolidation, and retrieval express their
  model contract as Zod schemas instead of prose plus regex, and degrade to their existing
  non-LLM fallbacks when the model cannot satisfy the schema.

### Modified Capabilities

<!-- No existing spec in openspec/specs/ has requirements about internal query output
     parsing or memory LLM contracts; the nearest specs (session-store, unified-message-chain)
     cover message shape and persistence, which this change does not touch. -->

## Impact

- `packages/core/src/models/adapter/side-text-query.ts` — new structured variant beside
  `runSideTextQuery`; the four existing text callers (`session-service`,
  `session-lifecycle-commands` ×2) keep the text path unchanged.
- `packages/core/src/agent/agent-log/types.ts` + `schemas.ts` — new `side-query` log category.
  The category list is declared **twice** (a TS union and a zod enum); both must be updated or
  `logEntrySchema` rejects the entry at write time.
- `packages/core/src/managers/managed-agent-session.ts` + `services/session-service.ts` —
  thread a log handle through `SessionHost` / `SessionPersistInput` so the three callers that
  currently have none can pass one.
- `packages/core/src/agent/memory/memory-retrieval.ts` — regex parser removed, schema added.
- `packages/core/src/agent/memory/memory-extractor.ts` — both `runSubagent` calls replaced;
  `parseJsonArray`, `parseConsolidationResponse`, `ExtractedMemory`,
  `ConsolidationDecisions` removed; `runSubagent` / `AgentManager` arguments dropped from
  the exported signatures, so `memory-service.ts` call sites change too.
- `packages/core/src/index.ts` — **public API removal**: the `MEMORY_EXTRACT_MAX_OUTPUT_LENGTH`
  and `MEMORY_CONSOLIDATE_MAX_OUTPUT_LENGTH` exports go away, since memory's `maxOutputLength`
  arguments were their only use.
- `packages/core/src/managers/services/memory-service.ts` — call-site updates.
- `packages/core/src/managers/services/session-service.ts` — the bare `catch {}` in
  `generateSessionTitle` is removed; a swallowed title failure leaves a trace.
- Memory workers are no longer subagents: the `subagent:` panel loses the
  `memory-extract` / `memory-consolidate` rows, and `aggregateUsageToParent` no longer
  attributes their tokens to the parent run.
- `AGENTS.md` and `packages/core/ARCHITECTURE.md` — both list memory among the internal
  subagent workers and must drop it.
- **Testing gap:** no existing suite exercises memory's subagent path
  (`validate-memory-service` / `-lifecycle` / `-extension` never reference `runSubagent`,
  `extractMemories`, or `consolidateMemories`), so this change adds its own check for the
  new failure mode rather than inheriting cover.
- **Risk:** these three calls currently run inside a subagent, so they inherit abort
  propagation and a dedicated model handle. The one-shot port must take an `abortSignal`
  (memory retrieval already passes one) and must not silently lose usage accounting.
- No new dependency; no version bump required (`@tanstack/ai@0.54.0`'s structured-output
  event-ordering fix is not required by this design — see design.md).
