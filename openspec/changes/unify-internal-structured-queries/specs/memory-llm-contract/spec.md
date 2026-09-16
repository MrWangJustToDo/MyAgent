## ADDED Requirements

### Requirement: Memory model contracts are expressed as schemas

Memory extraction, memory consolidation, and memory retrieval SHALL each express their
model output contract as a Zod schema, and that schema SHALL be the single source of truth
for both the request and the validation of the response. These paths MUST NOT recover
structured model output by pattern-matching raw text.

#### Scenario: Extraction contract is one schema

- **WHEN** extraction requests new memories from the model
- **THEN** the request and the response validation are both derived from the same schema
  describing the memory entry shape (name, type, description, body, optional importance,
  optional expiresAt)

#### Scenario: Consolidation contract is one schema

- **WHEN** consolidation requests merge and delete decisions from the model
- **THEN** the request and the response validation are both derived from the same schema
  describing the `merged` and `deleted` collections

#### Scenario: Retrieval contract is one schema

- **WHEN** retrieval asks the model to select relevant memory filenames
- **THEN** the request and the response validation are both derived from the same schema
  describing the selected-filename list

#### Scenario: No text pattern recovery remains on these paths

- **WHEN** the memory extraction, consolidation, and retrieval response paths are inspected
- **THEN** no regex-based JSON recovery (matching the first `[` to the last `]`, or a
  brace-delimited substring) is used to obtain the model's structured result

### Requirement: Memory type and value validation is shared with the schema

Field-level validation that memory entries already enforce SHALL be enforced by the schema
rather than by ad-hoc checks applied after parsing. This covers memory type membership,
importance range, and expiry timestamp, so an entry that reaches the writer has already
satisfied the same rules the schema states.

#### Scenario: Invalid memory type is rejected by the schema

- **WHEN** the model returns an entry whose type is not one of the known memory types
- **THEN** the schema validation rejects it instead of the caller silently substituting a
  default type

#### Scenario: Importance and expiry keep their existing accepted ranges

- **WHEN** the model returns an importance outside the accepted range or an unparseable
  expiry
- **THEN** the entry is rejected by the schema or normalized by an explicit schema
  transform, and the behaviour is covered by a test

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

## MODIFIED Requirements

<!-- None. -->

## REMOVED Requirements

### Requirement: Memory work is visible as subagent rows

**Reason**: Extraction and consolidation move off the subagent path onto the structured
one-shot query port, so they are no longer registered child agents and no longer appear as
`memory-extract` / `memory-consolidate` rows in the subagent panel.

**Migration**: Token usage and cost for these calls move from parent-run aggregation to the
shared usage history recorded by the one-shot port, which is already how retrieval, session
titles, and session summaries are accounted for. Callers that relied on the subagent rows to
observe memory activity should read the memory extension's own command surface instead.
