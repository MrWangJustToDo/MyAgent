## ADDED Requirements

### Requirement: Output mode is negotiated against declared model capability

The port SHALL select exactly one output mechanism per call — structured output or constrained
text — from the model's declared `json_output` capability, and SHALL NOT issue both for the same
attempt.

The capability follows the project-wide three-state contract: a **declared absence** (capabilities
resolved, `json_output` not among them) selects text mode directly; a **declared presence** and an
**unknown** capability (nothing declared) both start in structured mode. Unknown MUST NOT be
treated as absent, because routing an undescribable model through the weaker mechanism is the more
damaging default.

#### Scenario: A model that declares no structured output goes straight to text mode

- **WHEN** a caller issues a structured query against a model whose resolved capabilities do not
  include `json_output`
- **THEN** the port issues a plain text request, renders the schema contract into the prompt, and
  never calls the adapter's structured-output method

#### Scenario: An unknown capability still attempts structured output

- **WHEN** a caller issues a structured query against a model whose capabilities are unknown
  (no metadata resolved, offline launch)
- **THEN** the port attempts structured output first, so a capable model is not silently downgraded

#### Scenario: The mode decision is observable

- **WHEN** the port selects a mode because of declared capability
- **THEN** it records which mode was chosen and why, so a provider that silently ignores a
  structured-output request is distinguishable from a model that returns nothing

## MODIFIED Requirements

### Requirement: Structured query failure is explicit and fallback-friendly

When the model cannot satisfy the schema, the port SHALL fail in a way the caller can detect and
recover from, and SHALL NOT return a partially-parsed or coerced object.

When structured output was attempted and fails (a transport error, a rejected request, or a reply
that does not validate), the port SHALL retry the same query **once** in constrained text mode
before reporting failure. It MUST NOT retry structured output, and MUST NOT retry more than once.
A call that selected text mode from the start (declared absence) is not a fallback and is not
retried.

#### Scenario: Model output violates the schema

- **WHEN** the model returns text that does not satisfy the requested schema in the selected mode
- **THEN** the port raises an error rather than returning an object that did not validate

#### Scenario: A structured failure falls back to text once

- **WHEN** a structured-output attempt fails for any reason and the model's capability did not
  declare structured output absent
- **THEN** the port issues one text-mode attempt with the rendered schema contract, and a failure
  of that attempt is reported as the call's failure

#### Scenario: No repeated retry

- **WHEN** both modes have been attempted and the query still fails
- **THEN** the port reports the failure without further attempts, so a broken model cannot turn one
  internal call into an unbounded number of requests

#### Scenario: Caller falls back

- **WHEN** a caller catches a structured-query failure
- **THEN** it MUST degrade to a defined non-LLM path rather than propagating the error into
  the conversation

### Requirement: Structured one-shot query port

The system SHALL provide a one-shot internal query port that accepts a Zod schema and
returns the schema-validated object, without entering the agent loop, without tools, and
without producing a transcript that any host renders. The port MUST be usable by internal
callers (memory, titles, summaries) that are not conversational turns.

The schema SHALL be treated as a response filter, not a request constraint: a provider is
not required to enforce it, so every caller — and, in text mode, the port itself — MUST state the
fields its schema requires in the prompt it sends. A schema field the prompt never mentions is a
field the model has no reason to produce, and under an all-or-nothing contract every such reply is
rejected.

In text mode the port SHALL derive that field statement from the schema itself rather than
requiring each caller to restate it, so a required field cannot be omitted from the prompt by a
caller forgetting to update a hand-written contract. The rendered contract SHALL refuse, before
issuing the request, a schema whose shape it cannot express faithfully.

The schema SHALL have an object at its root, and the port MUST reject a non-object root at
the call site rather than issuing the request. A structured-output request is built from the
schema's `properties`, so a top-level array (or any root without `properties`) is sent as an
empty object schema; the model then invents a wrapper key and no reply can ever satisfy the
schema, which makes the query fail on every call. That failure mode is indistinguishable
from a flaky model after the fact, so it is refused up front instead.

#### Scenario: Prompts state the contract their schema enforces

- **WHEN** a caller issues a structured query
- **THEN** the prompt introduces each field the schema requires as a named field, including
  any enum together with its allowed values, so the model is told what to emit rather than
  only being judged afterwards

#### Scenario: The text-mode contract is derived from the schema

- **WHEN** the port composes a text-mode request
- **THEN** the required fields, their types, their enum values, and their optionality come from the
  schema rather than from a hand-maintained copy, so the prompt and the validator cannot disagree

#### Scenario: An inexpressible schema is refused

- **WHEN** a caller's schema uses a construct the contract renderer cannot express faithfully
- **THEN** the port raises an error naming the construct instead of sending a partially-rendered
  contract that would mislead the model

#### Scenario: Validated object is returned

- **WHEN** an internal caller invokes the port with a system prompt, a user prompt, and a
  Zod schema
- **THEN** the port returns the object produced by the model, already parsed and validated
  against that schema, together with the raw model text

#### Scenario: `raw` is the document the value came from

- **WHEN** the port returns a structured result
- **THEN** `raw` is the JSON **document** the value was parsed from — the completion event's
  own text on the structured path, and the located span (not the surrounding prose) on the
  text path. The two coincide only when the model replied with a bare document and nothing
  else, so a caller must not treat `raw` as a verbatim echo of the whole reply

#### Scenario: A non-object root schema is refused

- **WHEN** a caller passes a schema whose root is not an object (for example a bare array)
- **THEN** the port raises an error naming the required object root, before any request is
  issued, so the caller learns that its schema cannot be satisfied instead of receiving a
  per-call validation failure that looks like a model fault

#### Scenario: An object-root schema reaches the provider intact

- **WHEN** a caller passes a schema whose root is an object
- **THEN** the properties the schema declares survive into the request the provider receives,
  so the projected request is not degenerate (an empty property set cannot constrain the
  model and guarantees the response will not validate)

#### Scenario: No agent loop and no tools

- **WHEN** the port issues its request
- **THEN** it passes an empty tool set and does not run the agentic tool loop, so a schema
  request cannot be interrupted by tool phases

### Requirement: Internal query failures are observable

The port SHALL accept an optional agent log and SHALL record a warning when a query fails,
covering both a transport/model error and a structured-output validation failure. A caller
that handles a failure by degrading MUST leave a trace, either by logging it or by
returning a distinguishable failure to its own caller.

A failure that triggered a mode fallback SHALL be recorded **before** the fallback attempt, so a
provider that rejects or ignores structured output is visible even when the fallback subsequently
succeeds. Each record SHALL name the mode it happened in, because "the model returned nothing"
means something different in each.

#### Scenario: Transport or model error is logged

- **WHEN** a query fails at the transport or model level (including a `RUN_ERROR` stream
  event, which is not thrown by the stream consumer unless the port converts it)
- **THEN** the port records a warning carrying the failure reason, the model, and the
  elapsed duration

#### Scenario: Schema validation failure is logged with the reason

- **WHEN** a structured query's response does not satisfy the requested schema
- **THEN** the port records a warning carrying the validation reason and a bounded excerpt
  of the raw response, so a schema failure is distinguishable from a legitimate empty
  result

#### Scenario: A silent provider is visible behind a successful fallback

- **WHEN** a structured attempt fails and the text-mode fallback succeeds
- **THEN** the structured failure is recorded with the mode it occurred in, so the provider's
  behaviour is diagnosable rather than hidden by the recovery

#### Scenario: Degrading caller leaves a trace

- **WHEN** a caller swallows a query failure and falls back to a non-LLM path
- **THEN** the fallback is recorded, and a silent `catch` with no log entry is not an
  acceptable implementation
