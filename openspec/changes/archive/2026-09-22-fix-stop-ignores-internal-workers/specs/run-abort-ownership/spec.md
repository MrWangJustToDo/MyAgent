## ADDED Requirements

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
