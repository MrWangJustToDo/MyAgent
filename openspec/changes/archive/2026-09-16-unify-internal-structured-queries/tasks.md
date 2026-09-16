## 0. SDK upgrade (do first — see design D5)

- [x] 0.1 Bump `@tanstack/ai` to `^0.54.0` in all three declaring packages: `packages/core`, `packages/app`, `packages/im-bridge`
- [x] 0.2 Bump adapters in `packages/core`: `@tanstack/ai-openai ^0.22.6`, `@tanstack/ai-anthropic ^0.18.6`, `@tanstack/openai-base ^0.10.11` (their peer range is `@tanstack/ai ^0.54.0`)
- [x] 0.3 Bump `@tanstack/ai-code-mode` and `@tanstack/ai-mcp` in `packages/core` / `packages/node` (agreed: one wave)
- [x] 0.4 Add `@tanstack/ai@0.54.0` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` if the install refuses it on age grounds
- [x] 0.5 `pnpm install` and confirm no peer/deprecation warnings are introduced
- [x] 0.6 Full `pnpm build` on the upgraded tree
- [x] 0.7 Run the stream-related validations as the upgrade's regression gate: `validate:suppress-replayed-tool-chunks`, `validate:run-stream-recovery`, `validate:stream-errors`, `validate:code-mode-extension`, `validate:tanstack-adapter`, `validate:middleware-order`
- [x] 0.8 Run `pnpm typecheck` and `pnpm --filter @my-agent/app test`; compare against the pre-upgrade numbers
- [x] 0.9 Only proceed to group 1 once 0.7/0.8 are clean

## 1. Structured query port

Structured output is an **overload on the existing `runSideTextQuery`**, not a new function
(design D5b), so the four existing text callers keep their current types.

- [x] 1.1 Add a Zod-schema option to `runSideTextQuery` in `packages/core/src/models/adapter/side-text-query.ts`: `{ schema, systemPrompt, userPrompt, maxOutputTokens?, abortSignal?, disableThinking? }`
- [x] 1.2 Express the two shapes as TypeScript **overloads** (schema present → structured result `{ data, raw, usage?, durationMs }`; absent → the existing `{ text, usage?, durationMs }`), so no existing caller changes
- [x] 1.3 Implement the structured branch against `chat({ outputSchema, stream: true })`; read the object from the `structured-output.complete` CUSTOM event and token usage from `RUN_FINISHED`, per design D1
- [x] 1.4 Throw when the completion event never arrives or the payload fails schema validation; do not return a coerced or partial object (spec: explicit failure)
- [x] 1.5 Record usage in `sharedUsageHistory` exactly as the text path does, so structured calls appear in the cost graph
- [x] 1.6 Reuse the existing abort plumbing and the per-`modelStyle` thinking-disable option rather than reimplementing them. **The token cap is not shared plumbing:** `maxOutputTokens` must be spelled per adapter (`max_completion_tokens` for openai-style chat-completions, `max_tokens` for anthropic), because `modelOptions` is spread verbatim into the provider body and no adapter reads a generic `maxTokens` — see design D11.
- [x] 1.9 Assert the request's output-token cap reaches the adapter under its native key, per `modelStyle` (design D11).
- [x] 1.7 Audit the return shape against every consumer expectation (iterable vs promise) and reconcile with any `assertAsyncIterable` caller that can reach this port
- [x] 1.8 Confirm the structured branch passes no tools, so the engine takes its tool-less structured path (`skipAgentLoop`)

## 2. Port validation

- [x] 2.1 Add a `validate:*` script that runs one structured query with a real adapter against a two-field schema and asserts the returned object is validated
- [x] 2.2 Assert in the same script that usage is reported and lands in the shared usage history
- [x] 2.3 Add the negative case: a schema the model cannot satisfy must throw, not return a partial object
- [x] 2.4 Mutation test the usage assertion — temporarily drop the usage capture and confirm the script fails (spec: usage is not silently dropped)
- [x] 2.5 Mutation test the failure logging — drop the `warn` call and confirm the script that asserts a failure entry was written fails (spec: failures are observable)
- [x] 2.6 Assert the text path still works unchanged (the overload's other branch), so the existing four callers are provably unaffected

## 2b. Logging on the port

- [x] 2b.1 Add a `side-query` entry to `LogCategory` in `packages/core/src/agent/agent-log/types.ts`
- [x] 2b.2 Add the same entry to the duplicated `logCategories` array in `packages/core/src/agent/agent-log/schemas.ts` — the list exists twice, and a missing entry makes `logEntrySchema` reject the entry at write time
- [x] 2b.3 Give the port an optional `log?: AgentLog` parameter; log under the `side-query` category internally (no caller-supplied category)
- [x] 2b.4 Log a warning on transport/model failure, including the `RUN_ERROR` case, carrying reason + model + `durationMs`
- [x] 2b.5 Log a warning on structured-output validation failure, carrying the validation reason and a bounded raw-response excerpt
- [x] 2b.6 Leave the success path quiet (no per-call info line), per the agreed noise trade-off
- [x] 2b.7 Thread a log handle to the three callers that lack one: add `getLog` to `SessionHost` (`managed-agent-session.ts:22`), add `log` to `SessionPersistInput` (`session-service.ts:22`), and populate it in `getSessionPersistInput` (`managed-agent-session.ts:58`)
- [x] 2b.8 Pass the log from `findRelevantMemories` / `selectWithLLM` in `memory-retrieval.ts` instead of its own local warning, so the port's entry is the single record for a transport failure
- [x] 2b.9 Replace the bare `catch {}` in `session-service.ts` `generateSessionTitle` with a path that leaves a trace
- [x] 2b.10 Verify `bridgeTelemetryToAgentLog` (`event-log-rules.ts`) needs no change — it maps telemetry events to categories and does not enumerate every `LogCategory`

## 3. Memory retrieval migration

- [x] 3.1 Define the retrieval selection schema (`{ selected_memories: string[] }`) as the single contract for the call
- [x] 3.2 Switch `selectWithLLM` in `packages/core/src/agent/memory/memory-retrieval.ts` to the structured variant and delete the `/\{[\s\S]*?\}/` match plus the `JSON.parse` block
- [x] 3.3 Route schema-validation failures into the existing `selectWithKeywords` fallback and confirm the turn continues
- [x] 3.4 Keep the usage accounting that `selectWithLLM` performs today (`usage.addTotal`) working against the structured result
- [x] 3.5 Verify the four existing `runSideTextQuery` callers (session titles, session summaries, `session-service`) are unaffected

## 4. Memory extraction migration

- [x] 4.1 Define the extraction entry schema (name, type, description, body, optional importance, optional expiresAt) reusing `memoryTypeSchema`; fold type membership, importance range, and expiry parsing into the schema so the ad-hoc post-parse checks go away. **Schema-failure granularity is all-or-nothing by decision (design D10):** one malformed entry rejects the whole response rather than being skipped, and the optional hints (importance / expiresAt) normalize instead of rejecting. Note the deliberate asymmetry with consolidation, which is also all-or-nothing but for a different reason — there a partial application loses files.
- [x] 4.2 Replace the `runSubagent` call in `extractMemories` with the structured variant; drop `tools`/`maxIterations`/`bridgeUI`/`autoDestroy` options that only existed for the subagent path
- [x] 4.3 Delete `parseJsonArray`, and the `ExtractedMemory` interface if nothing else needs it
- [x] 4.4 Keep an output bound: pass `maxOutputTokens` and, if needed, cap accepted entries after validation instead of truncating the payload
- [x] 4.5 Thread an `abortSignal` from the triggering turn into the call
- [x] 4.6 Catch schema failure and return zero new memories without surfacing an error into the conversation

## 5. Memory consolidation migration

- [x] 5.1 Define the consolidation schema (`{ merged: [...], deleted: string[] }`) including the per-entry fields, `replaces` as a string array, and optional `importance` / `expiresAt`
- [x] 5.2 Replace the `runSubagent` call in `llmConsolidate` with the structured variant
- [x] 5.3 Delete `parseConsolidationResponse` and the `ConsolidationDecisions` interface. **No collection-level `.catch([])`** — see design D10; the interface is kept only as the schema's inferred type.
- [x] 5.4 Catch schema failure and report no change, leaving existing memories untouched
- [x] 5.5 Confirm the two-phase flow is unchanged: phase 1 LLM decisions, phase 2 hard-cap eviction staying pure JS

## 6. Call-site and API cleanup

- [x] 6.1 Update `packages/core/src/managers/services/memory-service.ts` for the changed `extractMemories` / `consolidateMemories` signatures
- [x] 6.2 Remove the `AgentManager` forwarding chain, which exists only to hand `manager` to `runSubagent`: the `manager` field on `MemoryExtractionInput`, its destructuring in `runExtraction` (`memory-service.ts:155`), the `manager` parameter on `extractMemories` / `consolidateMemories` / `llmConsolidate`, and the `manager` argument at `managed-agent-run-lifecycle.ts:125`. Also removes the now-unreferenced `manager` parameter on `finalizeManagedAgentRun` and `ManagedAgent.finalizeRun` (an unused named parameter is NOT reported by `tsc`, so grep is what finds these).
- [x] 6.3 Rely on `pnpm typecheck` (not grep) to prove no call site was missed in 6.2
- [x] 6.4 Remove now-unused imports (`runSubagent`, `AgentManager`) from the memory modules
- [x] 6.5 Confirm no module still imports the removed parsers or interfaces (`grep` for `parseJsonArray`, `parseConsolidationResponse`, `ExtractedMemory`, `ConsolidationDecisions`)

## 6b. Subagent surface cleanup

Apply the D8 rule: remove only options whose references drop to zero. Memory's departure leaves
`aggregateUsageToParent`, `maxIterations`, and `bridgeUI` with a single remaining consumer
(`auto-compact`) — those MUST stay.

- [x] 6b.1 Delete `MEMORY_EXTRACT_MAX_OUTPUT_LENGTH` and `MEMORY_CONSOLIDATE_MAX_OUTPUT_LENGTH` from `memory-extractor.ts:37,40` — memory's `maxOutputLength` arguments were their only use
- [x] 6b.2 Delete the matching public re-export at `packages/core/src/index.ts:201-204` (public API removal; the package is 0.0.1 and unpublished, so no shim)
- [x] 6b.3 Confirm zero remaining references to either constant across the repo, including `packages/core/scripts/`
- [x] 6b.4 Confirm `aggregateUsageToParent`, `maxIterations`, and `bridgeUI` still have their `auto-compact` consumer and were NOT deleted — verify by reading the call sites, not by assuming
- [x] 6b.5 Confirm `description` is still set by `compaction` / `progress-summary` / `task-prefork` and that nothing was removed on the mistaken belief it was memory-only
- [x] 6b.6 Confirm no empty-tools special case was introduced or removed in `run-subagent.ts` — the `tools` option is passed straight through with no `{}`-vs-`undefined` branch to clean up
- [x] 6b.7 Update `AGENTS.md:592` — drop memory from the "used by compaction and memory subagents" note on `bridgeUI: false`
- [x] 6b.8 Update `packages/core/ARCHITECTURE.md:232` — drop `memory` from the worker-profile list `runSubagent — task / compact / memory`
- [x] 6b.9 Format the changed markdown with prettier (repo convention for docs edits)

## 6c. Regression cover for the migration

No existing suite observes this path (D9): `validate-memory-service`, `validate-memory-lifecycle`,
and `validate-memory-extension` never reference `runSubagent`, `extractMemories`, or
`consolidateMemories`. Add the one guard the new failure mode needs.

- [x] 6c.1 Add a `validate:*` script asserting extraction returns 0 (and does not throw) when the structured query fails schema validation — the spec's "Extraction failure is contained" requirement. Also covers the consolidation counterpart, including the rejected-merge case below.
- [x] 6c.5 Assert a rejected merge never deletes its sources (design D10): an invalid `merged` entry plus `deleted` naming those files must leave every file on disk and log the offending field path.
- [x] 6c.6 Assert an unrecognized consolidation top-level shape is rejected rather than read as "nothing to do".
- [x] 6c.7 Assert the output-token cap uses the adapter's native key (`max_completion_tokens` for openai-style, `max_tokens` for anthropic) — a cap under the generic `maxTokens` name is silently ignored by every adapter.
- [x] 6c.2 Assert the same for consolidation: a failed query reports no change and leaves existing memories untouched
- [x] 6c.3 Mutation test 6c.1 by letting the error propagate, and confirm the script fails
- [x] 6c.4 Register the new script in `packages/core/package.json`

## 7. Acceptance

- [x] 7.1 Verify the subagent panel no longer lists `memory-extract` / `memory-consolidate` rows, and that this is the intended observable change (spec: REMOVED requirement)
- [x] 7.2 Verify memory tokens still appear in the usage/cost graph, now attributed to the internal side-query contributor
- [x] 7.3 Run `pnpm --filter @my-agent/core run validate:memory-extension` and the other affected `validate:*` scripts
- [x] 7.4 Run `pnpm typecheck`, `pnpm build:core`, and `pnpm lint` on the changed files
- [x] 7.5 Exercise a real turn that triggers extraction with a large dialogue and confirm no truncation-related parse failure occurs (the current regex path's worst case)
- [x] 7.6 Confirm no `chat({ outputSchema })` call was added to the agent run loop, `AgentRunner`, or `SubagentConfig` — this change must not enter the conversational path
