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

### Requirement: Session cancellation is not suppressed by internal workers

A user cancellation SHALL always terminate the session run. Internal worker agents — compaction summarizers, memory summarizers, and any future worker spawned for the system rather than for a user-visible delegation — MUST NOT prevent that termination.

An internal worker SHALL be identified by the absence of a task binding (`parentTaskToolCallId` / `parentTaskId`). Only a subagent that carries a task binding MAY take the subagent-first cancellation branch, because only for that row does the parent run need to survive the child's stop in order to read the cancellation.

#### Scenario: Stop while only an internal worker is active

- **WHEN** the user cancels while a compaction summarizer is running and no task subagent is active
- **THEN** the session run is aborted, and the summarizer does not make the cancellation a no-op

#### Scenario: Stop is not a no-op for the session

- **WHEN** the user cancels and the only active subagent row is an internal worker
- **THEN** the session run reaches a terminal aborted state, and no further compaction is started for that run

### Requirement: Task delegations keep the subagent-first cancellation branch

A user-visible `task` delegation SHALL keep its existing cancellation ordering: the subagent is stopped first and the parent run continues, so the task's cancellation result can be read by the parent model. This branch is distinct from the internal-worker case and MUST NOT be generalised to rows without a task binding.

#### Scenario: Task subagent is stopped first

- **WHEN** the user cancels while a `task` subagent is active
- **THEN** the subagent is stopped and its cancellation is reported back to the parent, and the parent run is left to finish the turn

#### Scenario: Internal workers do not enter the task branch

- **WHEN** the active subagent set contains an internal worker but no task-bound row
- **THEN** the task branch is not taken, and the session stop is not skipped on its behalf

### Requirement: An aborted session leaves no worker running behind it

When the session run is aborted, internal workers that are still active for that run SHALL be cancelled as part of the same cancellation. A worker MUST NOT continue producing output for a run that has already been aborted.

#### Scenario: Internal worker is cancelled with the session

- **WHEN** the session run is aborted while an internal worker is active
- **THEN** the worker is cancelled, and no summary or checkpoint from it is applied to the aborted run

### Requirement: Cancellation coverage for the stop branch

The repository SHALL maintain automated coverage for both branches of the stop decision, so that a newly added internal worker cannot silently reintroduce a suppressed session stop.

#### Scenario: Both stop branches are covered

- **WHEN** the test suite runs
- **THEN** it asserts that an internal-worker-only active set still aborts the session, and that an active task subagent is stopped
