## ADDED Requirements

### Requirement: localConnect implements ConnectConnectionAdapter

The system SHALL provide `localConnect(agentId)` returning a TanStack `ConnectConnectionAdapter` that runs the agent in-process without HTTP.

#### Scenario: Adapter contract

- **WHEN** `localConnect(agentId)` is called
- **THEN** it returns an object with `connect(messages, data, abortSignal, runContext)` yielding `AsyncIterable<StreamChunk>`
- **AND** the implementation uses TanStack `stream()` from `@tanstack/ai-client` wrapping `AgentManager.runAgentStream()`

#### Scenario: No network I/O

- **WHEN** `useChat` sends a message via `localConnect`
- **THEN** chunks are produced entirely in-process
- **AND** no `fetch`, SSE, or WebSocket connection is opened

### Requirement: runAgentStream yields AG-UI chunks

The system SHALL expose `AgentManager.runAgentStream(agentId, input)` that delegates to `AgentRunner.run()` and yields the same `StreamChunk` stream as TanStack `chat()`.

#### Scenario: Stream from manager

- **WHEN** `runAgentStream` is called with messages and an abort signal
- **THEN** it yields `RUN_STARTED`, content/tool events, and `RUN_FINISHED` chunks
- **AND** updates `ManagedAgent.status` and `ManagedAgent.usage` during the run

### Requirement: CLI uses native useChat with localConnect

The system SHALL wire CLI/app chat UI through `@tanstack/ai-react useChat` with `connection: localConnect(agentId)`.

#### Scenario: useAgentChat hook

- **WHEN** `useAgentChat` initializes for a managed agent
- **THEN** it calls `useChat({ connection: localConnect(agentId), tools: clientTools })`
- **AND** does not use Vercel `@ai-sdk/react` or a custom manual message subscription loop

#### Scenario: ChatClient handles stream to UIMessage

- **WHEN** chunks arrive from `localConnect.connect()`
- **THEN** TanStack `ChatClient` internal `StreamProcessor` updates the `messages` state exposed by `useChat`
- **AND** React components render from `useChat().messages`

### Requirement: Extension uses HTTP connect not localConnect

The system SHALL use HTTP-based `ConnectConnectionAdapter` (e.g. `fetchServerSentEvents`) for extension remote mode, not `localConnect`.

#### Scenario: Local vs remote transport

- **WHEN** the CLI runs in local mode
- **THEN** it uses `localConnect`
- **WHEN** the extension runs against a remote server
- **THEN** it uses `fetchServerSentEvents` or equivalent HTTP adapter pointing at the server RPC endpoint

### Requirement: Approval and client tools via useChat APIs

The system SHALL surface tool approval and `ask_user` client tool flows through TanStack `useChat` APIs (`addToolApprovalResponse`, client tool output methods), not custom parallel state.

#### Scenario: Command approval

- **WHEN** `run_command` triggers `needsApproval`
- **THEN** `useChat` exposes pending approval state
- **AND** user approval/denial is submitted via `useChat` approval response APIs

#### Scenario: Ask user client tool

- **WHEN** the model calls `ask_user`
- **THEN** `useChat` exposes the pending client tool call
- **AND** the UI submits the answer via `useChat` client tool output APIs
