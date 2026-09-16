## ADDED Requirements

### Requirement: Stream chunks never replace the durable channel
The system SHALL apply TanStack stream output to the UI channel as incremental part updates only. A `MESSAGES_SNAPSHOT` chunk SHALL NOT replace the channel message list.

#### Scenario: Interrupt snapshot after compaction
- **WHEN** compaction has appended a chronological summary and the same `chat()` later emits `MESSAGES_SNAPSHOT` (tool approval or client tool)
- **THEN** the channel keeps pre-compact messages and the summary at its chronological position; the snapshot is discarded

#### Scenario: Ordinary interrupt snapshot
- **WHEN** a `MESSAGES_SNAPSHOT` is emitted and the first message is not a compaction summary
- **THEN** the snapshot is still discarded; existing channel messages remain

### Requirement: Wire projection reads the live channel only
Chat middleware `onConfig` SHALL build LLM wire messages by converting the current UI channel and applying summary-first projection. The system SHALL NOT merge TanStack engine messages into that payload using `runBaselineCount` or engine length.

#### Scenario: Each iteration
- **WHEN** `onConfig` runs for an inner `chat()` iteration
- **THEN** wire `messages` are `getModelVisibleMessages(convert(channel.getMessages()))` (or identity when no summary exists)

#### Scenario: Tool result already on channel
- **WHEN** a server tool has finished earlier in the same `chat()` invocation
- **THEN** the next `onConfig` conversion includes that tool result from the channel without reading engine state

## MODIFIED Requirements

### Requirement: Middleware summary-first wire projection
Chat middleware SHALL project wire `messages` as: latest summary first, then kept recent real user turns preceding that summary, then messages after the summary. Channel order SHALL stay chronological. Projected wire arrays SHALL NOT be written back as the durable channel order. After a mid-`onConfig` compact append, middleware SHALL re-project from the updated channel for the same LLM call and SHALL NOT set `runBaselineCount` to prefer engine messages on later iterations.

#### Scenario: Wire reorder
- **WHEN** a summary exists on the channel
- **THEN** `onConfig` messages start with that summary, then kept turns, then post-summary traffic

#### Scenario: Post-compact same request
- **WHEN** compaction appends a SUMMARY mid-`onConfig`
- **THEN** middleware SHALL project wire from the updated channel (not the engine array) for that call; later `onConfig` iterations SHALL also project from the live channel

#### Scenario: No summary
- **WHEN** no compaction summary exists
- **THEN** wire messages are the channel-derived model messages without summary reorder
