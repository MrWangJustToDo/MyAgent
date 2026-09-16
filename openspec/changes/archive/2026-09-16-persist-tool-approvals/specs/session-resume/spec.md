## ADDED Requirements

### Requirement: Restore approvals with the session
The system SHALL restore the `approvals` table when a session is resumed so the next `chat()` can rebuild `resumeToolState`. The UI channel SHALL still hydrate from `uiMessages`.

#### Scenario: Resume loads approvals
- **WHEN** a session with `approvals` is resumed
- **THEN** the in-memory approval table matches the stored records and is available before the next pump

#### Scenario: Resume without approvals field
- **WHEN** a session without `approvals` is resumed
- **THEN** the in-memory table is empty unless backfilled from remaining UIMessage approval parts
