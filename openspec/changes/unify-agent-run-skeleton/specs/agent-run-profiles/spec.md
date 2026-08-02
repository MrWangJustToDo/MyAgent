## ADDED Requirements

### Requirement: InteractiveChat profile keeps multi-phase orchestration
The InteractiveChat profile (root agent chat via `AgentChatController`) SHALL remain responsible for multi-phase pumping, steer/followUp queues, approval / ask_user pauses, client tool waiting, and session UIMessage persistence. Those concerns MUST NOT be required inside the shared single-run skeleton.

#### Scenario: Queues stay outside the skeleton
- **WHEN** a user steers or follows up during an interactive chat run
- **THEN** queue drain and pump continuation remain owned by the InteractiveChat controller, not by the shared single-run helper

#### Scenario: Session persist remains chat-owned
- **WHEN** interactive chat messages reach a persist checkpoint
- **THEN** session UIMessage persistence continues through the existing chat/session sync path (not a new worker persist path)

### Requirement: Worker profile keeps isolation semantics
The Worker profile (task subagents, compaction, memory extraction, and similar) SHALL retain today’s isolation semantics: fresh or configured context, restricted or custom tools as today, optional `bridgeUI`, typically no SessionStore, and detached outcome finalization. Spawning and tool selection remain outside the shared skeleton.

#### Scenario: Task subagent still returns summary to parent
- **WHEN** a task-tool worker completes successfully after the refactor
- **THEN** the parent still receives a summary-style result as today (no requirement to expose full worker chat history to the parent model context)

#### Scenario: Headless compaction worker stays headless
- **WHEN** auto-compact or memory extraction runs a worker
- **THEN** it continues without UI bridging (`bridgeUI` false / headless consume)

### Requirement: Product behavior unchanged
Refactoring onto the shared skeleton MUST NOT intentionally change user-visible chat behavior, task-panel preview behavior, or headless worker success/failure contracts. Differences that exist today between chat and workers for tools, abort isolation, and persistence MUST remain unless a separate change explicitly alters them.

#### Scenario: Abort isolation for task workers preserved
- **WHEN** a parent chat is aborted while a task worker is running under today’s isolation rules
- **THEN** worker abort coupling remains as currently implemented (no silent change to share the parent abort controller unless a future change specifies it)

### Requirement: Extension seams without premature product features
Architecture and code organization MUST allow later optional InteractiveChat (or equivalent) on a child agent and multiple root `AgentSession` instances without requiring a second unrelated run stack. This change MUST NOT implement interactive subagent UX or multi-root product UI.

#### Scenario: Skeleton is agent-instance scoped
- **WHEN** the shared single-run path is invoked
- **THEN** it operates on the provided `ManagedAgent` / manager pair and MUST NOT assume a process-wide singleton chat controller beyond that instance

#### Scenario: Future interactive worker is a profile choice
- **WHEN** a future change wants interactive controls on a subagent
- **THEN** it can layer InteractiveChat (or a subset) on that child agent using the same skeleton, rather than inventing a third run pipeline
