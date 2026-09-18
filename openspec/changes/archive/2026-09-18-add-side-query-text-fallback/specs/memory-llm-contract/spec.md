## MODIFIED Requirements

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
