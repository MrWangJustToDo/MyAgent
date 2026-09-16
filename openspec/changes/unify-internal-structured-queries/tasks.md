## 1. Structured query port

- [ ] 1.1 Add a structured variant beside `runSideTextQuery` in `packages/core/src/models/adapter/side-text-query.ts` taking `{ schema, systemPrompt, userPrompt, maxOutputTokens?, abortSignal?, disableThinking? }` and returning `{ data, raw, usage?, durationMs }`
- [ ] 1.2 Implement it against `chat({ outputSchema, stream: true })`; read the object from the `structured-output.complete` CUSTOM event and token usage from `RUN_FINISHED`, per design D1
- [ ] 1.3 Throw when the completion event never arrives or the payload fails schema validation; do not return a coerced or partial object (spec: explicit failure)
- [ ] 1.4 Record usage in `sharedUsageHistory` exactly as the text variant does, so structured calls appear in the cost graph
- [ ] 1.5 Reuse the existing abort plumbing and the per-`modelStyle` thinking-disable option from the text variant rather than reimplementing them
- [ ] 1.6 Audit the return shape against every consumer expectation (iterable vs promise) and reconcile with any `assertAsyncIterable` caller that can reach this port
- [ ] 1.7 Export the new variant from `packages/core/src/models/index.ts` (and `dev/dev-models.ts` if the validate scripts need it)

## 2. Port validation

- [ ] 2.1 Add a `validate:*` script that runs one structured query with a real adapter against a two-field schema and asserts the returned object is validated
- [ ] 2.2 Assert in the same script that usage is reported and lands in the shared usage history
- [ ] 2.3 Add the negative case: a schema the model cannot satisfy must throw, not return a partial object
- [ ] 2.4 Mutation test the usage assertion — temporarily drop the usage capture and confirm the script fails (spec: usage is not silently dropped)

## 3. Memory retrieval migration

- [ ] 3.1 Define the retrieval selection schema (`{ selected_memories: string[] }`) as the single contract for the call
- [ ] 3.2 Switch `selectWithLLM` in `packages/core/src/agent/memory/memory-retrieval.ts` to the structured variant and delete the `/\{[\s\S]*?\}/` match plus the `JSON.parse` block
- [ ] 3.3 Route schema-validation failures into the existing `selectWithKeywords` fallback and confirm the turn continues
- [ ] 3.4 Keep the usage accounting that `selectWithLLM` performs today (`usage.addTotal`) working against the structured result
- [ ] 3.5 Verify the four existing `runSideTextQuery` callers (session titles, session summaries, `session-service`) are unaffected

## 4. Memory extraction migration

- [ ] 4.1 Define the extraction entry schema (name, type, description, body, optional importance, optional expiresAt) reusing `memoryTypeSchema`; fold type membership, importance range, and expiry parsing into the schema so the ad-hoc post-parse checks go away
- [ ] 4.2 Replace the `runSubagent` call in `extractMemories` with the structured variant; drop `tools`/`maxIterations`/`bridgeUI`/`autoDestroy` options that only existed for the subagent path
- [ ] 4.3 Delete `parseJsonArray`, and the `ExtractedMemory` interface if nothing else needs it
- [ ] 4.4 Keep an output bound: pass `maxOutputTokens` and, if needed, cap accepted entries after validation instead of truncating the payload
- [ ] 4.5 Thread an `abortSignal` from the triggering turn into the call
- [ ] 4.6 Catch schema failure and return zero new memories without surfacing an error into the conversation

## 5. Memory consolidation migration

- [ ] 5.1 Define the consolidation schema (`{ merged: [...], deleted: string[] }`) including the per-entry fields, `replaces` as a string array, and optional `importance` / `expiresAt`
- [ ] 5.2 Replace the `runSubagent` call in `llmConsolidate` with the structured variant
- [ ] 5.3 Delete `parseConsolidationResponse` and the `ConsolidationDecisions` interface
- [ ] 5.4 Catch schema failure and report no change, leaving existing memories untouched
- [ ] 5.5 Confirm the two-phase flow is unchanged: phase 1 LLM decisions, phase 2 hard-cap eviction staying pure JS

## 6. Call-site and API cleanup

- [ ] 6.1 Update `packages/core/src/managers/services/memory-service.ts` for the changed `extractMemories` / `consolidateMemories` signatures and dropped `AgentManager` parameter
- [ ] 6.2 Remove now-unused imports (for example `runSubagent`, `AgentManager`) from the memory modules
- [ ] 6.3 Confirm no other module calls the removed parsers or interfaces (`grep` for `parseJsonArray`, `parseConsolidationResponse`, `ExtractedMemory`, `ConsolidationDecisions`)

## 7. Acceptance

- [ ] 7.1 Verify the subagent panel no longer lists `memory-extract` / `memory-consolidate` rows, and that this is the intended observable change (spec: REMOVED requirement)
- [ ] 7.2 Verify memory tokens still appear in the usage/cost graph, now attributed to the internal side-query contributor
- [ ] 7.3 Run `pnpm --filter @my-agent/core run validate:memory-extension` and the other affected `validate:*` scripts
- [ ] 7.4 Run `pnpm typecheck`, `pnpm build:core`, and `pnpm lint` on the changed files
- [ ] 7.5 Exercise a real turn that triggers extraction with a large dialogue and confirm no truncation-related parse failure occurs (the current regex path's worst case)
- [ ] 7.6 Confirm no `chat({ outputSchema })` call was added to the agent run loop, `AgentRunner`, or `SubagentConfig` — this change must not enter the conversational path
