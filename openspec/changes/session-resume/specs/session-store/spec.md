## ADDED Requirements

### Requirement: Session creation on agent start
The system SHALL create a new session with a unique ID when an agent starts a new conversation. The session SHALL be stored in `.sessions/{id}.json` relative to the project root.

#### Scenario: New session created
- **WHEN** the agent starts a new conversation (no resume flag)
- **THEN** a new session file is created with a unique ID, empty uiMessages, empty compactMessages, model config, and timestamps

### Requirement: Session auto-save on interaction complete
The system SHALL automatically persist the session state after each completed agent interaction (onFinish). The saved state SHALL include uiMessages (converted from context.messages), compactMessages, usage, and todos.

#### Scenario: Save after successful interaction
- **WHEN** the agent completes a streaming response (onFinish fires)
- **THEN** the session file is updated with current uiMessages (derived from context.messages), compactMessages, usage stats, and todo list

#### Scenario: Save preserves existing session ID
- **WHEN** a session is saved multiple times during a conversation
- **THEN** the same session file is updated (not a new file created)

### Requirement: Session listing
The system SHALL provide a function to list all available sessions for a given project root, returning metadata (id, name, model, provider, createdAt, updatedAt) without loading full message history.

#### Scenario: List sessions
- **WHEN** the user requests session list
- **THEN** all session files in `.sessions/` are read and metadata is returned sorted by updatedAt descending

#### Scenario: Empty sessions directory
- **WHEN** no sessions exist for the project
- **THEN** an empty array is returned

### Requirement: Session loading
The system SHALL provide a function to load a full session by ID, returning all stored data including uiMessages and compactMessages.

#### Scenario: Load existing session
- **WHEN** a valid session ID is provided
- **THEN** the full session data is returned from the file

#### Scenario: Load non-existent session
- **WHEN** an invalid session ID is provided
- **THEN** an error is returned indicating session not found

### Requirement: Session naming
The system SHALL auto-generate a session name from the first user message (truncated to 50 characters). The name SHALL be updatable.

#### Scenario: Auto-name from first message
- **WHEN** the first user message is sent in a new session
- **THEN** the session name is set to the first 50 characters of the message text

#### Scenario: Rename session
- **WHEN** the user provides a new name for a session
- **THEN** the session name is updated in the stored file

### Requirement: Session schema versioning
The system SHALL include a `version` field in the session file for future schema migrations.

#### Scenario: Version field present
- **WHEN** a session is saved
- **THEN** the file includes a `version: 1` field

### Requirement: Session deletion
The system SHALL provide a function to delete a session by ID.

#### Scenario: Delete existing session
- **WHEN** a valid session ID is provided for deletion
- **THEN** the session file is removed from disk
