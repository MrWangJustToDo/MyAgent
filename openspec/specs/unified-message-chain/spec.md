# unified-message-chain

## Purpose

The single durable conversation chain: the UI channel message list is the only store, compaction
summaries are appended in chronological position, and the model wire view is projected from it per
turn.
## Requirements
### Requirement: Single durable UIMessage chain on UI channel
The system SHALL treat the agent UI channel message list as the only durable conversation chain. The system SHALL NOT maintain a parallel message store.

#### Scenario: Persist reads channel
- **WHEN** the session is saved after a user message or pump completion
- **THEN** persisted `uiMessages` SHALL come from the UI channel

#### Scenario: No dual-write
- **WHEN** messages change (user send, tool result, turn_context admit, compact append)
- **THEN** the system SHALL update the UI channel only

### Requirement: UI channel required for LLM runs
Every agent that invokes the chat/LLM loop SHALL have an `AgentUIChannel` attached before the run. The system SHALL NOT support a headless LLM consume path without a channel carrier.

#### Scenario: Main agent
- **WHEN** the main agent starts a chat pump
- **THEN** a UI channel is attached and owns the message list

#### Scenario: Subagent
- **WHEN** a subagent runs
- **THEN** a UI channel is attached for that subagent’s messages

### Requirement: Append compaction summary chronologically
The system SHALL append a marked summary user message to the end of the UI channel chain when compaction succeeds. The system SHALL NOT splice the summary into an older mid-chain cut index.

#### Scenario: Compact appends at end
- **WHEN** compaction succeeds
- **THEN** the summary checkpoint is appended as the latest message at that moment

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

### Requirement: findCutPoint ignores synthetic rows
`findCutPoint` SHALL skip compaction summary messages and `<turn_context>` user messages when counting real user turns.

#### Scenario: Synthetic skips
- **WHEN** counting keepRecentFlows
- **THEN** summary and turn_context rows do not consume a keep slot

### Requirement: Transcript shows compact checkpoints
The transcript SHALL render compaction summary rows as checkpoint UI. `<turn_context>` SHALL remain hidden in the default transcript.

#### Scenario: Compact visible
- **WHEN** a summary checkpoint is in the chain
- **THEN** the transcript shows a compact affordance at that chronological position

### Requirement: AgentContext and legacy compact APIs removed
The system SHALL NOT export `AgentContext` or APIs that mirror the old dual-store compact model (`getSummaryMessage`, `getCompactIndex`, `syncContextFromUIMessages`, Context `getMessagesForLLM`). Session persistence SHALL NOT write `summaryMessage` or `compactIndex`.

#### Scenario: Public API
- **WHEN** hosts import `@my-agent/core`
- **THEN** conversation history is accessed via the UI channel / session `uiMessages`, not `AgentContext`

#### Scenario: No compact field persistence
- **WHEN** a session is saved
- **THEN** the file does not include `summaryMessage` or `compactIndex` fields

### Requirement: No legacy session migration
The system SHALL NOT implement migration from `summaryMessage`/`compactIndex` (or `compactMessages`) into in-chain summaries. Resume SHALL load `uiMessages` into the channel as-is.

#### Scenario: Resume uses uiMessages only
- **WHEN** a session is resumed
- **THEN** the UI channel is hydrated from `uiMessages` and obsolete compact fields are ignored if present in old files (not converted)

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

### Requirement: Tool-call parts carry a core-computed display payload

The durable UI message chain SHALL carry a host-facing display payload on tool-call parts, written by core when the tool call completes.

#### Scenario: Written once, at completion

- **WHEN** a server tool finishes (success, error, or denial)
- **THEN** core attaches the display payload to that tool-call part in the UI channel before/with the result

#### Scenario: Persisted with the chain

- **WHEN** the message chain is persisted and later restored
- **THEN** the payload is restored as written; hosts do not recompute historical rows

#### Scenario: Absent for older chains

- **WHEN** a restored chain has tool-call parts without a payload
- **THEN** hosts render them from the tool presentation catalog without error (no backfill or recomputation is performed)

#### Scenario: Excluded from the model wire

- **WHEN** the chain is projected to model messages
- **THEN** the display payload is not forwarded

