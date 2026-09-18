# Change: Give the internal structured-query port a capability gate and a constrained text mode

## Why

`runSideTextQuery({ schema })` is the one port behind memory extraction, consolidation,
retrieval, session titles, and summaries. It has exactly one way to get a structured result:
`chat({ outputSchema, stream: true })`. When that cannot work, every call fails — and the way it
fails depends on the provider's wire protocol, which the port never negotiates:

| `modelStyle` | Adapter | Mechanism | Failure when unsupported |
|---|---|---|---|
| `anthropic` | `@tanstack/ai-anthropic` 0.18.6 | forced tool call (`tool_choice: {type:"tool"}`, `input_schema` from `outputSchema.properties`) | API error, or the model answers with prose and the port throws `no structured-output completion event was emitted` |
| `openai` | `@tanstack/openai-base` | `response_format: { type: "json_schema", json_schema: { …, strict: true } }` | endpoint rejects `response_format` with a 400, or silently ignores it (no completion event), or honours it loosely |

Measured against the models.dev corpus in `.agents/cache/models-dev.json` (7843 entries):

- `structured_output: true` — 4286 (54.6%)
- `structured_output: false` — 1138 (**14.5%, positively declared as unsupported**)
- `structured_output` absent — 2419 (30.8%, undeclared)

So **45.4% of the catalog does not advertise structured output**, and 1138 models positively
declare they do not support it. The project already carries `structured_output` through
`deriveCapabilities` into the `json_output` capability (`models-dev.ts:307`,
`models/types.ts:47`) and into every host-facing flag — **and the port is the one consumer that
never reads it**.

The failure this produces is not hypothetical. The bare-array regression (`97c0fcd`) ran for two
days as "0 memories extracted, one schema warning per turn", and it was indistinguishable from a
flaky model after the fact. A model whose endpoint does not do `json_schema` at all fails the
same way, for the same reason, with the same absence of a trace — and 45% of models can hit it.

## What Changes

- **Capability gate.** The port reads the model's `json_output` capability and picks a mechanism,
  never both at once. `unknown` (`undefined` — nothing declared) keeps today's behaviour and
  attempts structured output, because assuming a model cannot do something is the more damaging
  default; a **declared** absence selects text mode.
- **Constrained text mode.** The schema is rendered into the prompt as an explicit field contract
  (the shape that already exists in the memory prompts, generalized), the request is a plain
  `chatStream`, and the reply is parsed by a **strict, total** extractor: fenced block or balanced
  JSON scan, then `JSON.parse`, then the same Standard Schema validation the structured path
  already runs. No repair, no coercion, no regex field-shaving.
- **Failure ladder.** With structured output attempted, a structured failure retries once in text
  mode before the call is reported as failed. This is what covers the "declared support but
  actually doesn't" case that no metadata can rule out.
- **Visibility.** A capability-driven mode choice and a fallback retry are both logged, so a
  provider that silently ignores `response_format` is diagnosable instead of looking like a model
  that returned nothing.
- **Prompt contract generalized.** The "name every field your schema requires" rule stops being a
  memory convention and becomes a port-level requirement of text mode, because text mode is the
  path where the prompt is the *only* contract.

## Capabilities

### Modified Capabilities

- `internal-structured-query`: the port negotiates its output mechanism against declared model
  capability, gains a constrained text mode with a total parser, and gains a fallback ladder on
  structured failure.
- `memory-llm-contract`: the blanket "no text pattern recovery remains on these paths" rule is
  narrowed. Recovery from a **complete JSON document** (fenced or brace-balanced) is permitted;
  regex-based JSON **repair** and field-by-field coercion stay forbidden.

## Impact

| Area | Change |
|------|--------|
| `packages/core/src/models/adapter/side-text-query.ts` | Mechanism selection, text branch reuse, fallback ladder, mode logging |
| `packages/core/src/models/adapter/schema-prompt.ts` (new) | Schema → prompt contract renderer; strict JSON extractor + validator |
| `packages/core/src/models/adapter/adapter-factory.ts` | `TextAdapterConfig` carries the resolved structured-output decision |
| `packages/core/src/managers/run-agent.ts` | `resolveTextAdapterForManaged` fills that field from `managed.getModelInfo()` |
| `packages/core/src/agent/memory/memory-extractor.ts` | Prompt field list becomes generated from the schema (single source of truth) |
| Behavior | A model without structured output starts producing memories/titles/summaries instead of failing every call; a model that declares support is unchanged on the happy path |
| Specs | `internal-structured-query` (+2 requirements, 2 modified), `memory-llm-contract` (1 modified) |

## Non-Goals

- **Not** adding a second LLM round-trip to repair a malformed reply. One attempt per mode; a
  failure is a failure.
- **Not** treating "declared unsupported" as a reason to skip schema validation. Text mode
  validates the same schema, so callers see no difference in what they receive.
- **Not** touching the conversational path. This is the internal one-shot port only; the agent
  loop is unaffected.
- **Not** a general "any JSON Schema → prompt" engine. Nested objects, arrays of objects, enums,
  and required/optional fields are in scope; `oneOf` / `anyOf` / recursive `$ref` rendering is a
  later concern and must be refused loudly rather than rendered wrong.
- **Not** fixing the bare-array root ban. `assertObjectRootSchema` stays; it is the reason
  structured output has a chance of working at all.

## Success Criteria

1. A model with `json_output` absent from its declared capabilities makes **zero** structured-output
   requests and still returns schema-valid data.
2. A model that declares `json_output` receives exactly one structured request, and on its failure
   exactly one text request — never two of the same kind.
3. The same schema is validated on both paths: a caller cannot observe which mode ran.
4. Every provider `chatStream` / `structuredOutputStream` failure and every extractor failure is
   logged with the mode it happened in.
5. `validate:side-text-query` covers mode selection, the ladder, and the extractor's accept/reject
   boundary; the negative cases are driven through the real `runSideTextQuery`.
6. `pnpm build`, `pnpm lint`, `pnpm typecheck`, and every existing `validate:*` pass.
