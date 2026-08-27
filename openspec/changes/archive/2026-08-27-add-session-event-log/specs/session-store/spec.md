## MODIFIED Requirements

### Requirement: Session auto-save on interaction complete

The system SHALL persist the session after each completed agent interaction by appending a durable whole-state checkpoint to the session journal and then writing a `.session.json` snapshot (throttled). The saved state SHALL include UI channel `uiMessages` (single conversation chain, including in-chain summaries and turn_context rows), usage, and todos. The system SHALL NOT persist `summaryMessage`, `compactIndex`, or `compactMessages`.

#### Scenario: Save after successful interaction

- **WHEN** the agent completes a streaming response / pump cycle
- **THEN** a durable journal record is appended with current uiMessages from the UI channel, usage stats, and todo list, and a snapshot is written

#### Scenario: Save preserves existing session ID

- **WHEN** a session is saved multiple times during a conversation
- **THEN** the same session file and journal are updated (not a new file created)

### Requirement: Session loading

The system SHALL load a session by ID by reading the `.session.json` snapshot and replaying journal records newer than the snapshot's recorded `seq`, so the returned data includes the latest `uiMessages`. Obsolete compact fields in old files MAY be present on disk but SHALL NOT be required or applied by the runtime.

#### Scenario: Load existing session

- **WHEN** a valid session ID is provided
- **THEN** session data including uiMessages is returned, reflecting any journal records newer than the snapshot

#### Scenario: Load non-existent session

- **WHEN** an invalid session ID is provided
- **THEN** an error is returned indicating session not found

#### Scenario: Load v4 snapshot-only session

- **WHEN** an older session file has a snapshot but no journal
- **THEN** load succeeds using the snapshot alone, unchanged

### Requirement: Session schema versioning

The system SHALL include a `version` field in the session file for future schema migrations. This change bumps `SESSION_VERSION` from 4 to 5.

#### Scenario: Version field present

- **WHEN** a session is saved
- **THEN** the file includes a `version: 5` field
