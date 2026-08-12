## MODIFIED Requirements

### Requirement: Restore compactMessages on resume
The system SHALL restore conversation continuity on resume from persisted `uiMessages` only (including any in-chain compaction summary already present in that list). The system SHALL NOT restore or migrate separate `compactMessages` / `summaryMessage` / `compactIndex` into the runtime.

#### Scenario: In-chain summary present
- **WHEN** a session is resumed whose `uiMessages` contain an in-chain `[CONVERSATION SUMMARY]` message
- **THEN** the UI channel is hydrated with those `uiMessages` and model-visible projection uses that summary

#### Scenario: Obsolete compact fields present
- **WHEN** a session file still contains obsolete compact fields
- **THEN** those fields are ignored; no migration runs

### Requirement: Provide UIMessages to client on resume
The system SHALL return the stored `uiMessages` to the client and load them into the UI channel.

#### Scenario: CLI resume
- **WHEN** a session is resumed in CLI mode
- **THEN** the stored uiMessages are applied to the UI channel

#### Scenario: Extension resume
- **WHEN** a session is resumed via the server API
- **THEN** the stored uiMessages are returned for the client to render
