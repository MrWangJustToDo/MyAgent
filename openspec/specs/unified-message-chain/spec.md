# unified-message-chain

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
Chat middleware SHALL project wire `messages` as: latest summary first, then kept recent real user turns preceding that summary, then messages after the summary. Channel order SHALL stay chronological. Projected wire arrays SHALL NOT be written back as the durable channel order.

#### Scenario: Wire reorder
- **WHEN** a summary exists on the channel
- **THEN** `onConfig` messages start with that summary, then kept turns, then post-summary traffic

#### Scenario: Post-compact same request
- **WHEN** compaction appends a SUMMARY mid-`onConfig` while TanStack engine messages still match the pre-compact length
- **THEN** middleware SHALL project wire from the updated channel (not the stale engine merge) and set `runBaselineCount` so later iterations prefer the projected engine until the next prepareForRun

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
