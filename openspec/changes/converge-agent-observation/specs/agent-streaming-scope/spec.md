## ADDED Requirements

### Requirement: Streaming callbacks are scoped by agent id

The system SHALL associate tool streaming subscribers and emitters with an `agentId`. A subscriber registered for agent A MUST NOT receive chunks emitted for agent B. Subscribe and emit APIs MUST require an `agentId`.

#### Scenario: Two agents stream concurrently
- **WHEN** agent A and agent B both emit stdout chunks for different tool call ids
- **THEN** a subscriber scoped to A receives only A’s chunks and a subscriber scoped to B receives only B’s chunks

### Requirement: Emit path includes agent id

Tool streaming emit APIs SHALL require an `agentId` so chunks are published into that agent’s subscriber set. Emitting for an agent with no subscribers MUST be a no-op.

#### Scenario: Emit with agent id reaches scoped subscribers
- **WHEN** `emitStreamingChunk` is called with a known `agentId` and matching subscribers exist
- **THEN** those subscribers are invoked with the chunk payload
