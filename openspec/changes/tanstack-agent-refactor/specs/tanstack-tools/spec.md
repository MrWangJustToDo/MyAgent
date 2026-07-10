## ADDED Requirements

### Requirement: Tools use TanStack toolDefinition

The system SHALL define agent tools using TanStack `toolDefinition()` with Zod v4 `inputSchema` and optional `outputSchema`.

#### Scenario: Server tool with execute

- **WHEN** a filesystem tool is created
- **THEN** it is defined via `toolDefinition({ name, description, inputSchema }).server(execute)`
- **AND** the execute function receives `ToolExecutionContext` with `abortSignal` and `emitCustomEvent`

#### Scenario: Tool factory returns array

- **WHEN** `createTanStackTools()` is called
- **THEN** it returns `ServerTool[]` suitable for `chat({ tools })`
- **AND** not a Vercel `Record<string, Tool>` (`ToolSet`)

### Requirement: Approval-required tools use needsApproval

The system SHALL mark tools that require user confirmation (e.g. `run_command`) with `needsApproval: true` on the tool definition.

#### Scenario: Run command awaits approval

- **WHEN** the model calls `run_command`
- **THEN** TanStack emits an approval request before execution
- **AND** execution proceeds only after user approval via the UI channel

### Requirement: Client-side ask_user tool

The system SHALL define `ask_user` as a client tool via `toolDefinition().client()` with no server execute function.

#### Scenario: Ask user blocks until UI responds

- **WHEN** the model calls `ask_user`
- **THEN** the tool call waits for client tool output from the UI
- **AND** the user's answer is returned as the tool result to the model

### Requirement: Tool errors surface to model and UI

The system SHALL propagate tool execution errors as tool result errors visible in both the UI message parts and the model's subsequent turn.

#### Scenario: Tool execution failure

- **WHEN** a tool execute function throws or returns an error
- **THEN** the `tool-result` part has `state: "error"` with an error message
- **AND** the model receives the error content on the next iteration

### Requirement: Subagent tools are read-only subset

The system SHALL provide subagents with a restricted `ServerTool[]` containing only read-only tools (no `task`, no write tools).

#### Scenario: Subagent tool set

- **WHEN** a subagent `ManagedAgent` is created for a task
- **THEN** its tools include `read_file`, `glob`, `grep`, `list_file`, `tree`
- **AND** exclude `run_command`, `write_file`, `edit_file`, `delete_file`, `task`

### Requirement: Hook scripts integrate via middleware

The system SHALL invoke project hook scripts (PreToolUse, PostToolUse) through `HooksMiddleware` rather than inline in tool execute functions.

#### Scenario: PreToolUse blocks tool

- **WHEN** a hook script denies a tool call
- **THEN** `onBeforeToolCall` returns `{ type: "skip", result: ... }`
- **AND** the tool execute function is not called
