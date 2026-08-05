## MODIFIED Requirements

### Requirement: Session auto-save on interaction complete
The system SHALL automatically persist the session after each completed agent interaction. The saved state SHALL include UI channel `uiMessages` (single conversation chain, including in-chain summaries and turn_context rows), usage, and todos. The system SHALL NOT persist `summaryMessage`, `compactIndex`, or `compactMessages`.

#### Scenario: Save after successful interaction
- **WHEN** the agent completes a streaming response / pump cycle
- **THEN** the session file is updated with current uiMessages from the UI channel, usage stats, and todo list

#### Scenario: Save preserves existing session ID
- **WHEN** a session is saved multiple times during a conversation
- **THEN** the same session file is updated (not a new file created)

### Requirement: Session loading
The system SHALL load a session by ID including `uiMessages`. Obsolete compact fields in old files MAY be present on disk but SHALL NOT be required or applied by the runtime.

#### Scenario: Load existing session
- **WHEN** a valid session ID is provided
- **THEN** session data including uiMessages is returned

#### Scenario: Load non-existent session
- **WHEN** an invalid session ID is provided
- **THEN** an error is returned indicating session not found

### Requirement: Session creation on agent start
The system SHALL create a new session with a unique ID when an agent starts a new conversation. The session SHALL be stored under `.agents/sessions/` and SHALL initialize with empty `uiMessages` and without compact parallel fields.

#### Scenario: New session created
- **WHEN** the agent starts a new conversation (no resume flag)
- **THEN** a new session file is created with a unique ID, empty uiMessages, model config, and timestamps, and without `summaryMessage`/`compactIndex`/`compactMessages`
