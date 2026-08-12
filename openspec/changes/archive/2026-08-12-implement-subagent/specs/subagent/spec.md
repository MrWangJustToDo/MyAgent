## ADDED Requirements

### Requirement: Task tool spawns subagent

The system SHALL provide a `task` tool that spawns a subagent with fresh context to perform delegated work.

#### Scenario: Parent delegates exploration task
- **WHEN** parent agent calls `task` tool with prompt "Find what testing framework this project uses"
- **THEN** a new subagent is created with empty messages array
- **AND** the subagent executes the task using its available tools
- **AND** only the final summary text is returned to the parent as tool result

#### Scenario: Task tool includes description
- **WHEN** parent agent calls `task` tool with prompt and description "explore tests"
- **THEN** the description is shown in the UI as the task label
- **AND** the subagent executes with the full prompt

### Requirement: Subagent has fresh context

The system SHALL create each subagent with an empty messages array, isolating it from the parent's conversation history.

#### Scenario: Context isolation
- **WHEN** a subagent is spawned
- **THEN** the subagent's messages array starts empty
- **AND** the subagent does not have access to parent's previous messages
- **AND** when subagent completes, its full message history is discarded

### Requirement: Subagent has restricted read-only tools

The system SHALL provide subagents with a restricted tool set containing only read-only operations.

#### Scenario: Read-only tool set
- **WHEN** a subagent is created
- **THEN** it SHALL have access to: `read_file`, `glob`, `grep`, `bash`, `list_file`
- **AND** it SHALL NOT have access to: `write_file`, `edit_file`, `delete_file`, `task`

#### Scenario: Subagent cannot spawn subagents
- **WHEN** a subagent attempts to use the `task` tool
- **THEN** the tool is not available in its tool set
- **AND** the model cannot recursively spawn subagents

### Requirement: Subagent shares filesystem

The system SHALL allow subagents to access the same sandbox/filesystem as the parent agent.

#### Scenario: File access
- **WHEN** parent creates a file before spawning subagent
- **THEN** subagent can read that file
- **AND** subagent operates in the same working directory

### Requirement: Subagent streams output to UI

The system SHALL stream subagent progress to the UI in real-time for visibility.

#### Scenario: Streaming display
- **WHEN** a subagent is executing
- **THEN** its text output and tool calls stream to the UI
- **AND** the output is displayed in a visually distinct section (e.g., indented, different color)
- **AND** user can see subagent progress as it happens

### Requirement: Subagent has iteration limit

The system SHALL enforce a maximum iteration limit on subagents to prevent infinite loops.

#### Scenario: Iteration limit reached
- **WHEN** subagent reaches 30 iterations without completing
- **THEN** the subagent stops execution
- **AND** returns a summary of what was accomplished so far
- **AND** indicates it was stopped due to iteration limit

### Requirement: Subagent returns summary only

The system SHALL return only the final text response from the subagent to the parent, not intermediate tool results.

#### Scenario: Summary extraction
- **WHEN** subagent completes (stop_reason is not tool_use)
- **THEN** the system extracts the final text content
- **AND** returns it as the `task` tool result to the parent
- **AND** parent's context contains only this summary, not subagent's tool calls

#### Scenario: Summary truncation
- **WHEN** subagent's final summary exceeds 5000 characters
- **THEN** the summary is truncated to 5000 characters
- **AND** a truncation notice is appended

### Requirement: Subagent token usage tracking

The system SHALL track subagent token usage separately and aggregate it to the parent.

#### Scenario: Usage aggregation
- **WHEN** subagent completes execution
- **THEN** its token usage (input + output tokens) is recorded
- **AND** the usage is added to the parent agent's total usage
- **AND** the breakdown is available for reporting

### Requirement: Subagent system prompt

The system SHALL provide subagents with a specialized system prompt that clarifies their role.

#### Scenario: Subagent role clarity
- **WHEN** a subagent is created
- **THEN** it receives a system prompt indicating it is a subagent
- **AND** the prompt instructs it to complete the task and summarize findings
- **AND** the prompt indicates it has read-only tools for exploration
