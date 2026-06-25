## ADDED Requirements

### Requirement: Restore compactMessages on resume
The system SHALL restore the persisted `compactMessages` into the agent's `AgentContext` when resuming a session, so the LLM continues with the correct working context.

#### Scenario: CompactMessages restored
- **WHEN** a session is resumed with stored compactMessages
- **THEN** the AgentContext's compactMessages and messages are both set to the stored compactMessages

### Requirement: Provide UIMessages to client on resume
The system SHALL return the stored `uiMessages` to the client layer so the UI can display the full conversation history.

#### Scenario: CLI resume
- **WHEN** a session is resumed in CLI mode
- **THEN** the stored uiMessages are passed as `initialMessages` to the Chat constructor

#### Scenario: Extension resume
- **WHEN** a session is resumed via the server API
- **THEN** the stored uiMessages are returned in the API response for the client to render

### Requirement: Restore model configuration
The system SHALL use the stored provider and model name to recreate the LanguageModel instance on resume. API keys SHALL be read from environment variables (not stored in session files).

#### Scenario: Same model available
- **WHEN** a session is resumed and the stored model/provider is available
- **THEN** the agent is configured with the same model as the original session

#### Scenario: Model unavailable
- **WHEN** a session is resumed but the stored model/provider cannot be instantiated (e.g., missing API key)
- **THEN** the system returns an error indicating the model is unavailable and suggests configuring the required environment variables

### Requirement: Restore usage and todos
The system SHALL restore token usage statistics and todo list state from the session on resume.

#### Scenario: Usage restored
- **WHEN** a session with usage data is resumed
- **THEN** the AgentContext reflects the stored usage (totalUsage for lifetime tracking)

#### Scenario: Todos restored
- **WHEN** a session with todos is resumed
- **THEN** the TodoManager is populated with the stored todos

### Requirement: Continue most recent session
The system SHALL provide a "continue" mode that automatically loads the most recent session for the current project without requiring the user to specify a session ID.

#### Scenario: Continue latest
- **WHEN** the user requests to continue (e.g., `--continue` flag)
- **THEN** the session with the most recent `updatedAt` timestamp for the current project is loaded

#### Scenario: No sessions available
- **WHEN** the user requests to continue but no sessions exist
- **THEN** a new session is created as normal

### Requirement: Resume specific session
The system SHALL allow resuming a specific session by ID or by name (partial match).

#### Scenario: Resume by ID
- **WHEN** the user provides a full session ID
- **THEN** that specific session is loaded

#### Scenario: Resume by name
- **WHEN** the user provides a session name (or partial match)
- **THEN** the matching session is loaded (or a list of matches is presented if ambiguous)
