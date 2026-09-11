## MODIFIED Requirements

### Requirement: Session creation on agent start
The system SHALL create a new session with a unique ID when an agent starts a new conversation. The session SHALL be stored as an append-only JSONL message log `.agents/sessions/{id}.session.jsonl` under `.agents/sessions/` and SHALL initialize with empty `uiMessages` and without compact parallel fields. Nothing is written to disk until the first save.

#### Scenario: New session created
- **WHEN** the agent starts a new conversation (no resume flag)
- **THEN** a session object with a unique ID, empty uiMessages, model config, and timestamps is created, and no file exists until the first save

#### Scenario: First line written on first save
- **WHEN** a brand-new empty session (no messages yet) is saved
- **THEN** the log's first line carries `message: null` and the initial `state` (including any `reservedAt`)

#### Scenario: No compact parallel fields
- **WHEN** a session is created
- **THEN** it has no `summaryMessage` / `compactIndex` / `compactMessages`

### Requirement: Session auto-save on interaction complete
The system SHALL persist the session by appending to the session's `.session.jsonl` log only the lines that changed since the last durable write: one line per new or changed `UIMessage` (the message plus a full snapshot of the non-message state at that point), and — when only non-message state changed (usage, cost, context tokens, todos, plan mode, auto mode, name, model, effort) — a re-emitted line for the last message with the new state. The saved state SHALL include UI channel `uiMessages` (single conversation chain, including in-chain summaries and turn_context rows), usage, and todos. When neither messages nor state changed, the system SHALL perform no disk IO and SHALL NOT advance `updatedAt`. The system SHALL NOT persist `summaryMessage`, `compactIndex`, or `compactMessages`, and SHALL NOT persist a standalone `approvals` field.

#### Scenario: Save after successful interaction
- **WHEN** the agent completes a streaming response / pump cycle
- **THEN** only the messages added or changed in that cycle are appended as lines, with the current state snapshot

#### Scenario: Runtime without append support
- **WHEN** a save produces lines but the environment's fs does not implement `appendFile`
- **THEN** the whole log is rewritten instead, so the update is durable rather than silently dropped

#### Scenario: Save preserves existing session ID
- **WHEN** a session is saved multiple times during a conversation
- **THEN** the same log file is appended to (not a new file created)

#### Scenario: State-only change re-emits the last message
- **WHEN** only non-message state changes (e.g. model switch, effort change, background token growth) with no new message
- **THEN** the last message line is re-emitted with the new state

#### Scenario: No-op save
- **WHEN** a session is saved with unchanged messages and unchanged state
- **THEN** no line is appended, no file is written, and `updatedAt` is not advanced

#### Scenario: Non-empty session becomes empty
- **WHEN** a save observes a session that previously had messages and now has none
- **THEN** the log file is rewritten to a single `message: null` line with the current state

### Requirement: Session listing
The system SHALL provide a function to list all available sessions for a given project root, returning metadata (id, name, model, provider, createdAt, updatedAt) without loading full message history. Listing SHALL read only the newest `state` line of each `.session.jsonl` log and SHALL NOT parse message bodies.

#### Scenario: List sessions
- **WHEN** the user requests session list
- **THEN** all `.session.jsonl` logs in `.agents/sessions/` are scanned and metadata is returned sorted by updatedAt descending

#### Scenario: Empty sessions directory
- **WHEN** no sessions exist for the project
- **THEN** an empty array is returned

### Requirement: Session loading
The system SHALL load a session by ID by folding its `.session.jsonl` log: the non-message state SHALL be the newest `state` line, and `uiMessages` SHALL be the message lines folded by `UIMessage.id` (a later line for the same id replaces the body without changing its position). Obsolete compact fields in old files MAY be present on disk but SHALL NOT be required or applied by the runtime.

#### Scenario: Load existing session
- **WHEN** a valid session ID is provided
- **THEN** session data including uiMessages is returned, reconstructed from the folded log

#### Scenario: Later line for the same message id wins
- **WHEN** a message id appears on multiple lines (streaming update, approval decision, state-only re-emit)
- **THEN** the latest body is used and the message keeps its first-seen position

#### Scenario: First line carries no message
- **WHEN** the log's first line has `message: null`
- **THEN** the state is applied and no message is produced for that line

#### Scenario: Load non-existent session
- **WHEN** an invalid session ID is provided
- **THEN** an error is returned indicating session not found

### Requirement: Session schema versioning
The system SHALL include a `version` field in the persisted session state for future schema migrations. This change sets `SESSION_VERSION` to 6, and sessions written at version 6 are not required to be readable by, or to read, earlier formats.

#### Scenario: Version field present
- **WHEN** a session is saved
- **THEN** the state snapshot lines include `version: 6`

## ADDED Requirements

### Requirement: Approval state derived from the message log
The system SHALL NOT store a standalone approvals table in the session. Approval status (pending / approved / denied with reason) SHALL be derived from the folded messages' tool-call `approval` parts on load. The approval decision timestamp (`approvalAt`) SHALL be taken from an explicit `approvalAt` entry on a log line when present (the real decision time, recorded when the approval was first persisted), and otherwise derived as the `messageUpdatedAt` of the earliest log line in which that tool call's approval first appears decided. Explicit entries SHALL take precedence over derivation, so a line that restamps `messageUpdatedAt` (a later re-emit or a whole-log rewrite) cannot overwrite the recorded decision time.

#### Scenario: Pending approval restored
- **WHEN** a session is resumed whose last line for a tool call has `approval.needsApproval === true` and `approval.approved === undefined`
- **THEN** a `pending` approval record is derived from that message

#### Scenario: Denied approval restores reason
- **WHEN** a tool call's part carries `approval.approved === false` with a reason
- **THEN** a `denied` record with that reason is derived

#### Scenario: Approval decision timestamp
- **WHEN** an approval first appears decided on a line that carries no explicit `approvalAt` entry for it
- **THEN** its `approvalAt` is that line's `messageUpdatedAt`

#### Scenario: Decision timestamp survives a whole-log rewrite
- **WHEN** the log is rewritten (a structural change or a non-empty → empty reset) after an approval was decided
- **THEN** every rewritten line is stamped with the rewrite time, but each line's explicit `approvalAt` entry keeps the original decision time

#### Scenario: Decision persists across a state-only re-emit
- **WHEN** the message carrying a decided approval is re-emitted for a state-only change
- **THEN** the derived approval decision and its original `approvalAt` are preserved
