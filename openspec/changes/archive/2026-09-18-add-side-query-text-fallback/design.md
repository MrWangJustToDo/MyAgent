## Context

The port has one real mechanism (structured output), and the only reason it works at all is the
object-root rule added in `97c0fcd`. Two provider families reach it differently — `anthropic`
forces a tool call and builds `input_schema` from the schema's `properties`;
`openai-base` sends
`response_format: { type: "json_schema", json_schema: { …, strict: true } }` and has a genuine
`structuredOutputStream`. Neither can be assumed present: `models.dev` positively declares
`structured_output: false` for 1138 of 7843 models and leaves it absent for another 2419.

Three questions had to be answered before writing tasks.

## 1. Where does the decision belong — port, adapter, or caller?

**Port, driven by a value the host already resolves.**

The port is the only place that knows both the requested schema and the mechanism; the callers
(memory, titles, summaries) are schema-agnostic by design and must stay that way. The adapter
layer cannot own it either: "should this call be structured?" is a property of the *call*, not of
the model, and a future caller may legitimately want text.

What the port needs is one boolean-ish input, resolved where model metadata is already resolved
(`resolveTextAdapterForManaged`, which already reads `managed.getModelInfo()` and hands the port a
`TextAdapterConfig`). So `TextAdapterConfig` gains a resolved field and the port reads it — the
same shape as the existing `reasoning` / `pricing` fields, which are likewise filled from
`ModelInfo` for the port's benefit.

Rejected: reading `ModelInfo` inside the port (it receives a `TextAdapterConfig`, not a
`ManagedAgent`, and callers construct it — `validate-structured-query.mjs` builds one directly).

## 2. What does "does not support structured output" mean, given `undefined ≠ []`?

This is the load-bearing decision, and the answer follows the contract already in
`models/types.ts`:

```
undefined — nothing was declared → gates are permissive
[]        — resolved, declares none → gates are strict
```

Applied here:

| Declared | Decision | Why |
|---|---|---|
| `json_output` present | structured, with text fallback on failure | the common case; must not regress |
| capabilities resolved, `json_output` absent | **text mode directly** | a positive declaration; 1138 models sit here, many of which also declare `tool_call: true` yet explicitly `structured_output: false` |
| capabilities `undefined` (unknown / offline / no metadata) | structured, with text fallback | assuming a capability is *missing* is the more damaging default — it would silently route every offline launch through the weaker mechanism |

The fallback ladder applies to the first and third rows; the second skips structured entirely, so
a positively-declared-unsupported model never pays for a request that is known to fail.

## 3. Is text mode JSON recovery, which the memory spec forbids?

**Partly — and the spec has to say which part.**

`memory-llm-contract` currently reads: *"no regex-based JSON recovery (matching the first `[` to
the last `]`, or a brace-delimited substring) is used to obtain the model's structured result"*.
That clause was written when the alternative to structured output was assumed to be worse. But the
alternative is not "regex the JSON out and hope":

- the extractor accepts only a **complete JSON document** — a fenced block, or a brace-balanced
  scan verified by `JSON.parse`;
- the parsed value then goes through **the same Standard Schema validation** as the structured
  path, transforms included, and a failure throws.

That is a different operation from `jsonrepair`-style mangling (inserting missing commas/braces to
rescue truncated output) and from field-shaving. The distinction is what the revised requirement
must draw, and it should be drawn in terms the implementation can be held to:

| Permitted | Forbidden |
|---|---|
| Locating a complete JSON document inside surrounding prose or a code fence | Repairing malformed JSON (balancing braces, inserting separators, closing truncated output) |
| `JSON.parse` on that document | Field-by-field coercion or defaults applied before validation |
| The same schema validation and transforms as the structured path | Skipping validation because the mode is "only a fallback" |

The trade-off is explicit: the memory spec's original wording bought a guarantee at the cost of a
45%-of-catalog failure mode with no trace. The revised wording keeps the guarantee that matters
(nothing unvalidated reaches a caller) and gives up the one that does not (which transport
produced the bytes).

## 4. Rendering the contract into the prompt

Two options, and only one keeps the single-source-of-truth property the specs assert:

| Option | Consequence |
|---|---|
| Hand-written JSON-literal examples per caller (today's memory prompts) | A new required field is added to the schema and every caller must remember to update its literal. `memory-llm-contract` already has a "a required field dropped from the prompt is a regression" rule *because this happened*. |
| **Render from the schema at call time** | The prompt cannot drift from the schema; the existing rule becomes structurally true instead of a rule to remember |
| Both | The literal examples demonstrate shape and the rendered field list guarantees completeness; the literal is illustrative, never authoritative |

Take the third: keep the hand-written example for readability (models do better with a concrete
sample), add a generated field list as the completeness guarantee. The renderer handles objects,
arrays of objects, enums, and required/optional markers, and **refuses** (`oneOf` / `anyOf` /
recursive `$ref`) rather than emitting a contract it cannot express — a wrong prompt is worse than
a loud error.

## 5. Where validation lives

Unchanged, deliberately. Both modes converge on the existing `validateAgainstSchema`, so the
fallback cannot become a second, laxer contract. The new extractor's only job is to *find* a
document; deciding whether it is acceptable stays where it already is.

## 6. Token budget

Text mode spends the schema contract as prompt tokens (the rendered field list plus the example),
so text-mode requests carry a larger prompt than structured ones, where the schema travels in
`response_format` / `input_schema`. The contract is a few hundred tokens for the shipped schemas.
It is worth recording, because a caller that sets a tight `maxOutputTokens` is unaffected but a
caller with a tight *context* budget is not — and the extra cost lands exactly on the models that
were previously failing outright, i.e. on a path that produced nothing before.

## 7. Two boundaries implementation made explicit

The extractor's policy is easier to state than to hold, and writing its tests is what surfaced the two
places it could drift.

**Bracket depth is part of "only a document".** Scanning for brace-balanced spans alone yields the
*inner* object of an array-root reply — `[{"a":1}]` contains a complete `{"a":1}`. A caller whose
schema happened to match that object would accept a reply the model never structured as an object,
which is the same "looks like it worked" failure the object-root rule exists to prevent. So the scan
tracks `[` depth alongside `{` depth and only emits a span that opened at the top level.

**Trailing junk is prose; malformed input is not.** `{"a":1}}` and `{"a":1} trailing {garbage` are
accepted, because the located span is complete and nothing is trimmed — the same rule that allows
prose *before* the document. What is refused is input where the document itself never closes
(truncation), does not parse (trailing comma), or is ambiguous (two complete documents). The line is
drawn at "was the document itself well-formed", not at "was the reply pure".

**`raw` differs per mode, and that is honest.** On the structured path it is the completion event's
own text; on the text path it is the located span. They coincide only for a bare-document reply, so
the spec now says `raw` is the document the value came from rather than a verbatim echo of the reply.
A shared fixture asserting deep-equal `raw` across modes would have been asserting something that is
not true in general.

## Risks

| Risk | Mitigation |
|---|---|
| A model that declares `json_output` and works today gets routed differently | Only a *declared absence* changes routing; declared-present and unknown both start in structured mode |
| Text mode silently produces different values than structured mode | Same schema, same validation, same transforms — asserted by a shared-fixture validator driving both paths with the same payload |
| The extractor becomes a place where "almost JSON" is accepted | Boundary cases (prose-wrapped, fenced, trailing comma, truncated, two documents) are asserted as explicit accepts/rejects |
| The fallback doubles latency for a broken model | One retry, only after a structured failure, logged with the mode — not a loop |
| Rendering a schema the renderer cannot express | Refused before the request, with the unsupported keyword named |
