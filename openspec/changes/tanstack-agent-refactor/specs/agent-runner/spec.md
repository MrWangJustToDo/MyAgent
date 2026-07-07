## ADDED Requirements

### Requirement: AgentRunner executes TanStack chat loop

The system SHALL provide an `AgentRunner` class that executes the agent loop by calling TanStack `chat()` and returning an `AsyncIterable<StreamChunk>`.

#### Scenario: Successful run returns AG-UI stream

- **WHEN** `AgentRunner.run()` is called with valid messages and a configured adapter
- **THEN** the method returns an async iterable of AG-UI `StreamChunk` events
- **AND** the stream includes `RUN_STARTED` at the beginning and `RUN_FINISHED` at the end

#### Scenario: Runner has no lifecycle state

- **WHEN** an `AgentRunner` instance completes a run
- **THEN** the runner SHALL NOT store status, session, memory, or usage on itself
- **AND** subsequent runs use only the runner's immutable configuration plus run input

### Requirement: AgentRunner supports tool execution

The system SHALL pass configured `ServerTool[]` to `chat({ tools })` so the TanStack agent loop executes tool calls and emits `TOOL_CALL_*` and `TOOL_CALL_RESULT` events.

#### Scenario: Tool call in loop

- **WHEN** the model requests a tool call during a run
- **THEN** the stream emits tool call start, args, end, and result chunks
- **AND** the tool's server execute function is invoked with parsed arguments

### Requirement: AgentRunner supports iteration limit

The system SHALL configure `agentLoopStrategy` (default `maxIterations(30)`) on `chat()` to bound agent loop iterations.

#### Scenario: Iteration limit reached

- **WHEN** the agent loop reaches the configured maximum iterations
- **THEN** the run terminates with a `RUN_FINISHED` event
- **AND** no further model calls are made

### Requirement: AgentRunner supports abort

The system SHALL accept an `AbortSignal` on run input and forward it to `chat({ abortController })`.

#### Scenario: User aborts run

- **WHEN** the abort signal is triggered during a run
- **THEN** the stream terminates
- **AND** in-flight tool execution receives the abort signal via `ToolExecutionContext.abortSignal`

### Requirement: AgentRunner accepts middleware

The system SHALL accept an array of `ChatMiddleware` in runner configuration and pass it to `chat({ middleware })`.

#### Scenario: Compaction middleware transforms messages

- **WHEN** `CompactionMiddleware` is configured on the runner
- **THEN** `onConfig` is invoked at each agent iteration
- **AND** returned message transforms are applied before the model call
