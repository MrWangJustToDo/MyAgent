# memory-llm-contract Specification

## Purpose

The contract between the memory subsystem and the model: memory retrieval, extraction, and
consolidation each express their request and response as a Zod schema, degrade without the
model rather than failing a turn, and run as one-shot structured queries instead of subagents.
## Requirements
### Requirement: Memory model contracts are expressed as schemas

Memory extraction, memory consolidation, and memory retrieval SHALL each express their
model output contract as a Zod schema, and that schema SHALL be the single source of truth
for both the request and the validation of the response. These paths MUST NOT obtain a structured
result by repairing or coercing raw model text.

Obtaining the result from a **complete JSON document** embedded in the reply — a fenced block, or
a brace-balanced scan — is not repair, and is permitted on the constrained-text path that runs
when the model's declared capability excludes structured output. Repairing malformed JSON
(balancing braces, inserting separators, closing a truncated document) and applying per-field
coercion or defaults before validation remain forbidden on every path.

#### Scenario: Extraction contract is one schema

- **WHEN** extraction requests new memories from the model
- **THEN** the request and the response validation are both derived from the same schema
  describing the memory entry shape (name, type, description, body, optional importance,
  optional expiresAt)

#### Scenario: The extraction schema root is an object

- **WHEN** the extraction schema is inspected or rendered into a provider request
- **THEN** its root is an object that carries the entry array under a named key, and the
  prompt names that key — a top-level array root is not acceptable, because the request is
  built from the schema's `properties` and an array root is projected as an empty object,
  which makes every extraction reply fail validation

#### Scenario: Every memory schema reaches the provider non-degenerate

- **WHEN** an extraction, consolidation, or retrieval schema is rendered the way the provider
  adapter renders it
- **THEN** the rendered request carries the properties the schema declares, so the model is
  actually constrained by the contract rather than by an empty object

#### Scenario: Consolidation contract is one schema

- **WHEN** consolidation requests merge and delete decisions from the model
- **THEN** the request and the response validation are both derived from the same schema
  describing the `merged` and `deleted` collections

#### Scenario: Retrieval contract is one schema

- **WHEN** retrieval asks the model to select relevant memory filenames
- **THEN** the request and the response validation are both derived from the same schema
  describing the selected-filename list

#### Scenario: A JSON document may be located, but never repaired

- **WHEN** the memory response paths are inspected on the constrained-text path
- **THEN** a complete JSON document may be located inside the reply (fenced, or brace-balanced)
  and parsed, but no step may alter the text to make it parseable — no brace balancing, no
  separator insertion, no closing of a truncated document — and the parsed value must pass the
  same schema validation and transforms as a structured-output reply before any caller sees it

#### Scenario: Only a document, and only one

- **WHEN** the reply contains a document nested inside an **array**, or more than one complete
  document
- **THEN** the port treats it as a failure rather than choosing between them: an object reached
  only through an array is not an object-root document, and picking between two documents is a
  guess whose wrong answer would be returned as if it were the result

#### Scenario: A parsed document that fails validation is a failure

- **WHEN** a document is successfully parsed out of the reply but does not satisfy the schema
- **THEN** the call fails and the caller takes its non-LLM fallback, rather than the entries that
  happened to validate being used

### Requirement: Memory type and value validation is shared with the schema

Field-level validation that memory entries already enforce SHALL be enforced by the schema
rather than by ad-hoc checks applied after parsing. This covers memory type membership,
importance range, and expiry timestamp, so an entry that reaches the writer has already
satisfied the same rules the schema states.

#### Scenario: Invalid memory type is rejected by the schema

- **WHEN** the model returns an entry whose type is not one of the known memory types, on
  either the extraction or the consolidation response
- **THEN** the schema validation rejects the response instead of the caller silently
  substituting a default type, and the rejection is reported rather than swallowed

#### Scenario: A rejected merge never deletes its sources

- **WHEN** a consolidation response contains a merge that fails schema validation alongside
  deletions that name that merge's source files
- **THEN** no deletion is applied, because the merge that was supposed to replace those files
  did not happen — a partially-applied consolidation would destroy the only copy of the sources

#### Scenario: An unrecognized consolidation shape is not "nothing to do"

- **WHEN** a consolidation response is an object that carries neither a `merged` nor a
  `deleted` collection in the expected form
- **THEN** the response is treated as a failure rather than as an empty decision, so a
  malformed reply is never indistinguishable from a model that chose to change nothing

#### Scenario: Importance and expiry keep their existing accepted ranges

- **WHEN** the model returns an importance outside the accepted range or an unparseable
  expiry
- **THEN** the entry keeps its other fields and the unusable optional value is normalized
  away by an explicit schema transform, because these are optional hints rather than the
  result itself — unlike a rejected merge, dropping one cannot lose data

### Requirement: Memory work degrades without the LLM

Memory extraction, consolidation, and retrieval SHALL each retain a defined behaviour when
the model cannot satisfy the schema, so a schema failure never propagates into the
conversation or aborts a turn.

#### Scenario: Retrieval falls back to keyword selection

- **WHEN** the retrieval structured query fails or returns an empty selection
- **THEN** retrieval proceeds with its keyword-based fallback and the turn continues

#### Scenario: Extraction failure is contained

- **WHEN** the extraction structured query fails
- **THEN** extraction reports zero new memories and the turn is unaffected

#### Scenario: Consolidation failure is contained

- **WHEN** the consolidation structured query fails
- **THEN** consolidation reports no change and the existing memories are left untouched

### Requirement: Memory prompts declare the fields their schemas require

The memory prompts SHALL state every field the corresponding schema requires, including each
enum together with its allowed values, because the provider is not required to enforce the
schema and the prompt is therefore the only instruction the model receives.

#### Scenario: Consolidation prompt names the merged-entry fields

- **WHEN** the consolidation prompt is composed
- **THEN** it introduces every required merged-entry field (`name`, `type`, `description`,
  `body`, `replaces`) as a named field, and states `type` together with its four allowed
  values rather than leaving the model to infer them

#### Scenario: Extraction prompt names the entry fields and the envelope key

- **WHEN** the extraction prompt is composed
- **THEN** it introduces the top-level key the extraction schema requires, and every required
  entry field (`name`, `type`, `description`, `body`) as a named field with `type`'s four
  allowed values, because a key or field the prompt never mentions is one the model has no
  reason to produce

#### Scenario: A required field dropped from the prompt is a regression

- **WHEN** a prompt change stops naming a schema-required field
- **THEN** that is treated as a regression and covered by a test, because with an
  all-or-nothing contract every reply omitting that field is rejected whole

### Requirement: Memory work no longer runs as subagents

Memory extraction and consolidation SHALL run through the structured one-shot query port
rather than by spawning a subagent, so they cannot be truncated by a subagent output
budget and cannot have cancellation notices appended to their payload.

#### Scenario: Extraction result is not truncated

- **WHEN** extraction receives a result that satisfies its schema
- **THEN** the result is used in full, with no substring truncation applied to the
  structured payload

#### Scenario: Cancellation does not corrupt the payload

- **WHEN** an extraction or consolidation query is aborted
- **THEN** no cancellation notice text is appended to a structured payload, because the
  structured result is not assembled from the subagent text output

