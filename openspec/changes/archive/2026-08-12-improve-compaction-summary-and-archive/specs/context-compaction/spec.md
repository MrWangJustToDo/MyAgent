## ADDED Requirements

### Requirement: Full-context summarizer input
The system SHALL provide the summarization model with the current LLM-visible conversation segmented into content that will be compressed and content that will remain after compaction, while preserving the existing cut index and `summary + kept messages` application semantics.

#### Scenario: Summarizer sees kept recent turns
- **WHEN** auto or manual compaction runs and a cut point keeps the latest N user turns
- **THEN** the summarization prompt includes both the pre-cut segment and the kept segment (subject to summarization token budget)

#### Scenario: Post-compact message shape unchanged
- **WHEN** compaction applies a successful summary
- **THEN** the main agent LLM view remains a summary message followed by messages from the cut index onward (same assembly as before this change)

#### Scenario: Anti-duplication instructions
- **WHEN** the summarization prompt includes a still-in-context segment
- **THEN** the prompt instructs the model to prioritize summarizing the to-compress segment and not to restate the kept segment in detail

### Requirement: Segment labels in compaction prompt
The system SHALL label summarizer input so the model can distinguish archived history from remaining context.

#### Scenario: Labeled segments
- **WHEN** summarization runs with both pre-cut and kept messages
- **THEN** the user-facing summarization prompt marks them with explicit segment boundaries (for example to-compress vs still-in-context)

#### Scenario: Previous summary still incremental
- **WHEN** a previous conversation summary exists at the head of the LLM view
- **THEN** it continues to be passed for incremental update and is not double-counted as a user turn for cut detection
