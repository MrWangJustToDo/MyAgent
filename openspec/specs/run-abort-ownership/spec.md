# run-abort-ownership

## Purpose

Single-source-of-truth rules for run cancellation: who creates the run AbortController (RunCoordinator), how cancellation propagates to the LLM stream, in-flight tools, and child subagents, and how a stale pump recognizes it is no longer current (RunToken currency instead of comment-only invariants).

## Requirements

### Requirement: Single AbortController creation point

The system SHALL create exactly one `AbortController` per managed run, owned by `RunCoordinator`. The main chat run path and the subagent run path MUST pass the coordinator-owned controller (or its signal) to `AgentRunner.run` and MUST NOT rely on a runner-internal fallback controller. Any ad-hoc `AgentRunner` caller that omits the controller SHALL do so only through an explicit opt-in that is inaccessible from the managed run path.

#### Scenario: Main run aborts the LLM stream

- **WHEN** the user cancels an in-flight main chat run and `RunCoordinator.abort` fires the coordinator-owned controller
- **THEN** the TanStack `chat()` invocation for that run receives the abort and stops producing stream chunks

#### Scenario: Subagent run shares ownership rules

- **WHEN** a subagent run is started via `runAgentOnce` and is later aborted (directly or via parent teardown)
- **THEN** the abort reaches the subagent's LLM stream through the coordinator-owned controller, not through a runner-created fallback

### Requirement: Stale pump recognizes it is no longer current

A pump iteration started for a given run SHALL hold a run token whose currency is invalidated when the run is interrupted or superseded. When a pump iteration observes its token is no longer current, it MUST skip outcome adjudication and run finalization, and MUST NOT enqueue steer/followUp messages or continue tool phases. Finalization of an interrupted run SHALL happen at most once.

#### Scenario: Old pump unwinds after cancel-then-resend

- **WHEN** a run is cancelled and a new message is submitted while the old pump's async callbacks are still unwinding
- **THEN** the old pump observes a non-current token, performs no finalize/outcome work, and does not defer the new message into the steer/followUp queues

#### Scenario: No double finalize

- **WHEN** both the interrupting path (`interruptCurrentRun`) and the old pump's natural completion path execute for the same run
- **THEN** `finalizeRun` runs exactly once for that run

### Requirement: Abort cancellation of in-flight tool work

When a run is aborted, tool invocations that have not reached a terminal state SHALL be marked cancelled, the cancellation SHALL be persisted with the aborted turn, and the persistence SHALL survive a session resume.

#### Scenario: Incomplete tools persisted on abort

- **WHEN** a run is aborted while tool rows are in-flight
- **THEN** those tool rows are transitioned to a cancelled terminal state and included in the persisted messages for the aborted turn

### Requirement: Parent abort cascades to in-flight task tools

When a run is aborted, any in-flight `task` tool invocation — preforked or serially executed — SHALL be cancelled: the subagent's LLM stream stops and the tool settles as aborted. The cascade SHALL flow through `ManagedAgent.abort` → child-agent abort (child registration + running-status gating), not through host-layer cooperation, and the serial path MUST NOT depend on the parent signal being passed through the tool execute context.

#### Scenario: Parent abort during serial task tool

- **WHEN** a run is aborted while a serially-executed `task` tool has a running subagent
- **THEN** the subagent (child managed agent) is aborted via the parent's cascade path, its stream stops, and the task tool settles with `aborted: true`

#### Scenario: Prefork path unchanged

- **WHEN** a run is aborted while preforked subagents are queued or running
- **THEN** queued entries settle as aborted stubs and running entries are aborted via their existing parent-signal listener

### Requirement: Concurrency regression coverage

The repository SHALL maintain automated tests covering the abort/unwind matrix: abort during streaming, abort during a tool phase, cancel followed immediately by a new submission, and old-pump unwind after a new run has started.

#### Scenario: Matrix test suite exists

- **WHEN** the core package test suite runs
- **THEN** it includes scenarios asserting each abort/unwind matrix case produces single finalize, no stale-pump continuation, and no negative depth or generation drift
