## ADDED Requirements

### Requirement: Shared single-run skeleton
The system SHALL provide a shared single-run orchestration path used for one LLM/tool stream execution on a `ManagedAgent`. That path MUST cover optional UI channel attach, starting the agent stream, consuming the stream into UIMessages (or equivalent), and applying a run outcome with an explicit outcome path. Interactive chat phases and worker/subagent runs MUST use this shared path for that per-stream work rather than maintaining separate full copies of prepare→run→consume→finalize.

#### Scenario: Chat phase uses the skeleton
- **WHEN** `AgentChatController` executes one stream iteration during its pump
- **THEN** it performs stream consume and outcome application through the shared single-run path (not a private duplicate of the full consume/outcome sequence)

#### Scenario: Worker run uses the skeleton
- **WHEN** a subagent/worker executes its (typically single) stream
- **THEN** it uses the same shared single-run path for stream consume and outcome application

### Requirement: Explicit consume modes
The shared consume step SHALL support at least two modes: UI channel consume (messages projected via `AgentUIChannel`) and headless consume (messages built without requiring a UI channel). Callers MUST select the mode; the skeleton MUST NOT silently attach UI for headless workers such as compaction or memory extraction.

#### Scenario: Headless worker does not require UI channel
- **WHEN** a worker run is configured for headless consume
- **THEN** the run completes without attaching or requiring `AgentUIChannel`

#### Scenario: UI consume updates messages through the channel
- **WHEN** a run uses UI consume mode with an attached channel
- **THEN** stream chunks are processed through that channel into UIMessage snapshots

### Requirement: Outcome path remains caller-selected
The shared skeleton MUST accept the existing outcome path distinction (`chat` vs `detached`, or equivalent) from the caller/profile and MUST NOT force workers onto the chat status finalization path. Product status behavior for task-panel workers (forced terminal / no ghost active status) MUST be preserved.

#### Scenario: Detached path for workers
- **WHEN** a worker/subagent run finishes through the shared skeleton with the detached outcome path
- **THEN** status finalization follows the detached rules (terminal for UI/task panel), not the interactive chat wait/idle rules

#### Scenario: Chat path for interactive pump
- **WHEN** a chat pump stream finishes through the shared skeleton with the chat outcome path
- **THEN** status finalization follows chat rules (including waiting / awaiting_user when applicable)

### Requirement: No new host observation API
This capability MUST NOT introduce a parallel host observation facade. Hosts continue to use `AgentSession`; the skeleton is package-internal (or curated only if needed for validates).

#### Scenario: Hosts still use AgentSession
- **WHEN** app UI wires run updates after this change
- **THEN** it continues to use AgentSession subscribe/dispatch rather than a new run-skeleton host API
