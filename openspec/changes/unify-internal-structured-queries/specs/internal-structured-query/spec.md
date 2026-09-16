## ADDED Requirements

### Requirement: Structured one-shot query port

The system SHALL provide a one-shot internal query port that accepts a Zod schema and
returns the schema-validated object, without entering the agent loop, without tools, and
without producing a transcript that any host renders. The port MUST be usable by internal
callers (memory, titles, summaries) that are not conversational turns.

#### Scenario: Validated object is returned

- **WHEN** an internal caller invokes the port with a system prompt, a user prompt, and a
  Zod schema
- **THEN** the port returns the object produced by the model, already parsed and validated
  against that schema, together with the raw model text

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

## MODIFIED Requirements

<!-- None: no existing requirement in openspec/specs/ governs internal query output
     parsing or the memory LLM contract. -->
