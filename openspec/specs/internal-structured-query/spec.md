# internal-structured-query Specification

## Purpose

The one-shot LLM port used for internal, non-conversational work — memory selection, session
titles, session summaries, memory extraction and consolidation. It defines how those calls
request a structured result, how token usage is attributed, and how a failure is made visible,
so every such call shares one contract instead of each caller recovering JSON on its own.

## Requirements
### Requirement: Structured one-shot query port

The system SHALL provide a one-shot internal query port that accepts a Zod schema and
returns the schema-validated object, without entering the agent loop, without tools, and
without producing a transcript that any host renders. The port MUST be usable by internal
callers (memory, titles, summaries) that are not conversational turns.

The schema SHALL be treated as a response filter, not a request constraint: a provider is
not required to enforce it, so every caller MUST state the fields its schema requires in the
prompt it sends. A schema field the prompt never mentions is a field the model has no reason
to produce, and under an all-or-nothing contract every such reply is rejected.

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

#### Scenario: Validated object is returned

- **WHEN** an internal caller invokes the port with a system prompt, a user prompt, and a
  Zod schema
- **THEN** the port returns the object produced by the model, already parsed and validated
  against that schema, together with the raw model text

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

### Requirement: Token usage is preserved on the structured path

The port SHALL report token usage for every structured query and SHALL record it in the
shared usage history, so internal structured calls remain visible in usage and cost
reporting exactly as their text counterparts are today.

#### Scenario: Structured query records usage

- **WHEN** a structured query completes and the adapter reported usage
- **THEN** the usage is returned to the caller and recorded against the internal
  side-query contributor in the shared usage history

#### Scenario: Usage is not silently dropped

- **WHEN** the port is implemented by consuming the structured-output event stream
- **THEN** token usage MUST be taken from a stream event that carries it, and the port MUST
  NOT be implemented by a call shape that discards usage while still returning the object

### Requirement: Structured query failure is explicit and fallback-friendly

When the model cannot satisfy the schema, the port SHALL fail in a way the caller can
detect and recover from, and SHALL NOT return a partially-parsed or coerced object.

#### Scenario: Model output violates the schema

- **WHEN** the model returns text that does not satisfy the requested schema
- **THEN** the port raises an error rather than returning an object that did not validate

#### Scenario: Caller falls back

- **WHEN** a caller catches a structured-query failure
- **THEN** it MUST degrade to a defined non-LLM path rather than propagating the error into
  the conversation

### Requirement: Caller abort is honoured

The port SHALL accept an abort signal and SHALL cancel the in-flight model request when it
fires.

#### Scenario: Abort during a structured query

- **WHEN** a caller's abort signal fires while a structured query is in flight
- **THEN** the underlying request is aborted and the port settles without emitting a result

### Requirement: Internal query failures are observable

The port SHALL accept an optional agent log and SHALL record a warning when a query fails,
covering both a transport/model error and a structured-output validation failure. A caller
that handles a failure by degrading MUST leave a trace, either by logging it or by
returning a distinguishable failure to its own caller.

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

#### Scenario: Degrading caller leaves a trace

- **WHEN** a caller swallows a query failure and falls back to a non-LLM path
- **THEN** the fallback is recorded, and a silent `catch` with no log entry is not an
  acceptable implementation

### Requirement: The port logs under its own category

The port SHALL log under a dedicated log category rather than reusing an existing one, and
that category MUST be accepted by the persisted log-entry schema so entries are not
dropped at write time.

#### Scenario: Dedicated category is accepted by the schema

- **WHEN** the port writes a log entry under its own category
- **THEN** the log-entry schema accepts the category and the entry survives serialization

#### Scenario: No existing category is repurposed

- **WHEN** the port's log entries are inspected
- **THEN** they are not filed under a caller's category (for example the memory
  subsystem's), so a consumer filtering by category sees the port's own activity

