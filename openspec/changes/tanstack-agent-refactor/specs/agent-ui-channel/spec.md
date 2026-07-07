## ADDED Requirements

### Requirement: AgentUIChannel converts stream to UIMessage

The system SHALL provide `AgentUIChannel` wrapping TanStack `StreamProcessor` to convert `AsyncIterable<StreamChunk>` into an observable `UIMessage[]` array.

#### Scenario: Consume run updates messages

- **WHEN** `AgentUIChannel.consumeRun(stream)` is called with a chat stream
- **THEN** `onMessagesChange` fires as chunks are processed
- **AND** the final `UIMessage[]` includes assistant text, tool-call, and tool-result parts

#### Scenario: Subscribe to message updates

- **WHEN** a UI component calls `ui.subscribe(listener)`
- **THEN** the listener is invoked on every message array change during streaming
- **AND** unsubscribing stops further notifications

### Requirement: AgentUIChannel is for subagent preview and non-hook consumers

The system SHALL use `AgentUIChannel` for subagent read-only preview and other consumers that do not go through `useChat`. Main CLI chat uses `localConnect` + `useChat` instead.

#### Scenario: Main agent UI via useChat

- **WHEN** the root CLI chat renders messages
- **THEN** it uses `@tanstack/ai-react useChat` with `connection: localConnect(agentId)`
- **AND** does not subscribe directly to `ManagedAgent.ui` for message state

#### Scenario: Subagent preview UI

- **WHEN** a subagent run starts
- **THEN** a dedicated `AgentUIChannel` (or store entry keyed by subagent id) consumes the subagent stream
- **AND** the subagent preview panel renders messages from that channel

### Requirement: AgentUIChannel handles approval requests

The system SHALL forward TanStack `onApprovalRequest` events from `StreamProcessor` to `AgentManager` for user approval flow.

#### Scenario: Command requires approval

- **WHEN** a tool with `needsApproval: true` is called
- **THEN** `AgentUIChannel` surfaces an approval request with `toolCallId`, `toolName`, and `input`
- **AND** the UI can approve or deny via `AgentManager.approveToolCall()`

### Requirement: AgentUIChannel supports custom events

The system SHALL forward `CUSTOM` stream events through `onCustomEvent` for features like subagent progress notifications.

#### Scenario: Subagent custom event

- **WHEN** a tool emits a custom event during execution
- **THEN** `AgentUIChannel` forwards it to registered listeners
- **AND** UI components can react without parsing raw stream chunks

### Requirement: In-process CLI uses localConnect not HTTP

The system SHALL support CLI local mode via `localConnect` (`ConnectConnectionAdapter`) without `DirectChatTransport`, SSE, or manual `AgentUIChannel` subscription for the main chat.

#### Scenario: CLI local chat

- **WHEN** the CLI sends a user message
- **THEN** `useChat` calls `localConnect(agentId).connect(messages, …)`
- **AND** `AgentManager.runAgentStream()` yields chunks in-process
- **AND** no HTTP round-trip is required

### Requirement: Task tool summary streaming

The system SHALL stream subagent final summary text to the parent task tool's streaming output when summary text exceeds the configured threshold.

#### Scenario: Summary streams to task tool line

- **WHEN** a subagent produces summary text during `consumeRun`
- **THEN** incremental summary text is emitted to the parent task tool's stdout stream
- **AND** only the final summary step text is used (not intermediate narration)
