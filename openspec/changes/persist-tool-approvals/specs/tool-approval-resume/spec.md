## ADDED Requirements

### Requirement: Session-backed approval records
The system SHALL persist tool-approval decisions in a session-level `approvals` table independent of ModelMessage wire conversion. Records SHALL cover pending, approved, and denied states. Denied records SHALL include the user reason when one was given. Older session files MAY omit `approvals`; the runtime SHALL treat that as an empty table.

#### Scenario: Approve is recorded
- **WHEN** the user approves a tool call
- **THEN** the session `approvals` table contains an `approved` record for that tool call id / approval id

#### Scenario: Deny is recorded
- **WHEN** the user denies a tool call with a reason
- **THEN** the session `approvals` table contains a `denied` record including that reason

#### Scenario: Pending is recorded
- **WHEN** a tool call enters `approval-requested` and has not been answered
- **THEN** the session `approvals` table contains a `pending` record for that call

#### Scenario: Old session file
- **WHEN** a session file has no `approvals` field
- **THEN** restore uses an empty table (and MAY backfill from UIMessage parts that still carry `approval`)

### Requirement: Resume via resumeToolState
On each `chat()` `onConfig`, the system SHALL translate stored **approved** and **denied** records into `resumeToolState.approvals` using TanStack `ToolApprovalResolution` shape. Pending records SHALL NOT be sent as resolutions. The system SHALL NOT add `@tanstack/ai-persistence`.

#### Scenario: Approved decision resumes execution
- **WHEN** a session is restored (or a new `chat()` starts) with an `approved` record for a tool that still needs execution
- **THEN** middleware returns `resumeToolState.approvals` so the SDK executes that tool without asking again

#### Scenario: Denied decision stays denied
- **WHEN** a session is restored with a `denied` record
- **THEN** `resumeToolState.approvals` carries `{ approved: false }` and the denial reason still applies

#### Scenario: Pending still interrupts
- **WHEN** a session is restored with only a `pending` record for a tool
- **THEN** that id is omitted from `resumeToolState.approvals` and the run waits for user approval

#### Scenario: Composes with compaction
- **WHEN** compaction middleware also returns projected `messages`
- **THEN** approval `resumeToolState` is shallow-merged and both take effect
