## 1. Capability plumbing

- [x] 1.1 Extend `TextAdapterConfig` (`models/adapter/adapter-factory.ts`) with the resolved structured-output decision, defaulting to "attempt structured" so every existing constructor (validators build one directly) keeps today's behaviour
- [x] 1.2 Fill it in `resolveTextAdapterForManaged` (`managers/run-agent.ts`) from `managed.getModelInfo()?.capabilities`, following the `undefined ≠ []` contract: `undefined` → attempt, present → attempt, resolved-without-`json_output` → text mode
- [x] 1.3 Add `validate:capability-unknown-vs-none` coverage for the new field, so the three states are asserted at the port's input boundary too

## 2. Schema → prompt contract (new module)

- [x] 2.1 Add `models/adapter/schema-prompt.ts` exporting a contract renderer that walks the schema's JSON Schema form (objects, arrays of objects, enums, required/optional markers)
- [x] 2.2 Refuse constructs the renderer cannot express faithfully (`oneOf`, `anyOf`, recursive `$ref`) with an error naming the construct, before any request is issued
- [x] 2.3 Add the strict, total JSON extractor: fenced block first, then a brace-balanced scan, then `JSON.parse`; return `null` rather than a repaired or partial value
- [x] 2.4 Unit-cover the extractor's boundary in `validate:side-text-query`: prose-wrapped document accepted; fenced document accepted; truncated, trailing-comma, and two-documents replies rejected

## 3. Port: mode selection and the fallback ladder

- [x] 3.1 Split `runStructuredQuery` so both modes share the request plumbing (abort mirror, thinking-off mapping, usage recording) and converge on `validateAgainstSchema`
- [x] 3.2 Implement mode selection from the resolved decision; text mode composes `systemPrompt` + rendered contract + the caller's example
- [x] 3.3 Implement the ladder: structured attempt → on failure, log (with the mode) → one text attempt → report failure if that also fails. No retry when text mode was selected from the start
- [x] 3.4 Log the mode decision (`side-query` category) when it was driven by declared capability, and log each failed attempt with its mode

## 4. Callers

- [x] 4.1 In `memory-extractor.ts`, keep the concrete JSON example but source the field list from the renderer so the prompt cannot omit a required field
- [x] 4.2 Do the same for the consolidation prompt, and confirm the retrieval prompt's `selected_memories` key is stated on both paths
- [x] 4.3 Confirm titles/summaries (`session-service`, `session-lifecycle-commands`) are text-mode callers already and are unaffected

## 5. Verification

- [x] 5.1 Extend `validate:side-text-query`: declared-absent capability issues **zero** structured calls and still returns validated data
- [x] 5.2 Extend it: structured failure triggers **exactly one** text attempt, and a text failure reports the failure (no third attempt)
- [x] 5.3 Extend it: unknown capability still attempts structured first
- [x] 5.4 Assert both modes validate the same payload identically (one fixture, two modes, same result), so the fallback cannot become a laxer contract
- [x] 5.5 Mutation-test each new assertion (route an unknown capability to text; drop the ladder; accept a repaired document) and confirm the expected failure
- [x] 5.6 Run `pnpm build`, `pnpm lint`, `pnpm typecheck`, and the `validate:*` suite; run `pnpm --filter @codent/app test`
- [x] 5.7 End-to-end against a provider whose model declares no structured output: memory extraction writes entries where it previously returned zero, with the mode choice visible in the log
