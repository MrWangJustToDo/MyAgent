## ADDED Requirements

### Requirement: Token estimation
The system SHALL provide token estimation for message arrays using character-based approximation (characters / 4).

#### Scenario: Estimate tokens for messages
- **WHEN** `estimateTokens(messages)` is called with an array of messages
- **THEN** the system returns an estimated token count based on the total character length

#### Scenario: Empty messages
- **WHEN** `estimateTokens([])` is called with empty array
- **THEN** the system returns 0

### Requirement: Micro compaction (Layer 1)
The system SHALL automatically replace old tool_result content with placeholders before each LLM call. Only the N most recent tool results are preserved intact.

#### Scenario: Recent tool results preserved
- **WHEN** micro_compact runs with keepRecent=3 and 5 tool results exist
- **THEN** the 3 most recent tool results retain their original content

#### Scenario: Old tool results compressed
- **WHEN** micro_compact runs with keepRecent=3 and 5 tool results exist
- **THEN** the 2 oldest tool results have content replaced with `[Previous: used {tool_name}]`

#### Scenario: Small tool results ignored
- **WHEN** a tool result has content less than 100 characters
- **THEN** the content is NOT replaced regardless of age

#### Scenario: Fewer results than threshold
- **WHEN** micro_compact runs with keepRecent=3 and only 2 tool results exist
- **THEN** all tool results retain their original content

### Requirement: Auto compaction (Layer 2)
The system SHALL automatically trigger full conversation compression when estimated tokens exceed the configured threshold.

#### Scenario: Threshold exceeded triggers compression
- **WHEN** estimated tokens exceed the configured threshold before an LLM call
- **THEN** the system summarizes the conversation via LLM

#### Scenario: Below threshold no action
- **WHEN** estimated tokens are below the configured threshold
- **THEN** no automatic compression occurs

#### Scenario: Messages replaced with summary
- **WHEN** auto compaction completes summarization
- **THEN** all messages are replaced with a compressed summary message pair (user summary + assistant acknowledgment)

### Requirement: Compact tool (Layer 3)
The system SHALL provide a `compact` tool that allows the agent to manually trigger conversation compression.

#### Scenario: Manual compact via tool
- **WHEN** agent calls the `compact` tool
- **THEN** the system performs the same compression as auto_compact

#### Scenario: Compact with focus parameter
- **WHEN** agent calls `compact` with `focus: "preserve API decisions"`
- **THEN** the summarization prompt includes the focus guidance

#### Scenario: Compact tool returns confirmation
- **WHEN** compact tool completes
- **THEN** the tool returns a message indicating compression was performed

### Requirement: LLM-based summarization
The system SHALL use the same language model as the agent to generate conversation summaries with a domain-specific prompt.

#### Scenario: Summary generation
- **WHEN** summarization is triggered
- **THEN** the LLM is called with the compaction prompt and conversation history

#### Scenario: Summary content requirements
- **WHEN** a summary is generated
- **THEN** it includes: what was done, current work, files modified, next steps, key decisions

#### Scenario: Summary replaces conversation
- **WHEN** summarization completes
- **THEN** messages are replaced with user message containing summary and assistant acknowledgment

### Requirement: Compaction configuration
The system SHALL support configurable compaction settings in the agent configuration.

#### Scenario: Default configuration
- **WHEN** no compaction config is provided
- **THEN** defaults are used: enabled=true, tokenThreshold=100000, keepRecentToolResults=3

#### Scenario: Custom threshold
- **WHEN** compaction config specifies `tokenThreshold: 50000`
- **THEN** auto compaction triggers at 50000 estimated tokens

#### Scenario: Compaction disabled
- **WHEN** compaction config specifies `enabled: false`
- **THEN** no automatic compaction occurs (micro or auto)

### Requirement: Integration with agent loop
The system SHALL integrate compaction into the message preparation phase before each LLM call.

#### Scenario: Compaction runs before LLM call
- **WHEN** agent prepares messages for an LLM call
- **THEN** micro_compact runs first, then auto_compact check occurs

#### Scenario: Compaction state persists
- **WHEN** messages are compressed
- **THEN** subsequent LLM calls use the compressed message state
