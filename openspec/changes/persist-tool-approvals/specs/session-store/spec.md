## ADDED Requirements

### Requirement: Persist tool approvals with the session
The system SHALL write the session `approvals` table together with `uiMessages` when the session is saved. The system SHALL NOT require `approvals` on older files.

#### Scenario: Save includes approvals
- **WHEN** the agent persists a session after an approval decision or pump cycle
- **THEN** the session file includes the current `approvals` array (possibly empty)

#### Scenario: Missing field on disk
- **WHEN** an older session file has no `approvals` key
- **THEN** load succeeds and `approvals` is treated as empty
