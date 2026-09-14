# command-jobs

## Purpose

Background shell jobs and their output: how `run_command(run_in_background)` starts a job through CoreEnv without blocking the turn, how `get_command_output` polls it incrementally and `kill_command` stops it, how output is retained (in-memory buffers plus a durable per-job log file readable with `read_file`), and how jobs and their files are cleaned up on eviction and environment teardown.

## Requirements

### Requirement: Background run_command returns a job id immediately

When `run_command` is invoked with `run_in_background: true`, the system SHALL start the command without waiting for process exit and SHALL return a structured result that includes a stable `jobId` and `status` of `running` (or equivalent). When `run_in_background` is absent or false, behavior SHALL remain foreground: wait for exit and return stdout/stderr/exitCode as today.

#### Scenario: Start background job

- **WHEN** the model calls `run_command` with a valid command and `run_in_background: true` and the host supports background commands
- **THEN** the tool result includes a `jobId` and does not block until the process exits

#### Scenario: Foreground unchanged

- **WHEN** the model calls `run_command` without `run_in_background` (or with false)
- **THEN** the tool waits for completion and returns exit code and captured output as before

#### Scenario: Unsupported host

- **WHEN** the model requests `run_in_background: true` but the registered CoreEnv does not support starting background commands
- **THEN** the tool fails with a clear error indicating background execution is unsupported

### Requirement: Poll background command output

The system SHALL provide a `get_command_output` tool that accepts a `jobId` and returns current status (`running` | `exited` | `killed` | `failed`) plus stdout/stderr captured since the last read (or since start), without blocking until exit.

#### Scenario: Incremental read while running

- **WHEN** a background job is running and the model calls `get_command_output` with that `jobId`
- **THEN** the tool returns status `running` and any new output available since the previous successful poll (or since job start on first poll)

#### Scenario: Read after exit

- **WHEN** a background job has exited and the model calls `get_command_output`
- **THEN** the tool returns the terminal status and remaining unread output including exit code when available

#### Scenario: Unknown job

- **WHEN** `get_command_output` is called with an unknown or destroyed `jobId`
- **THEN** the tool returns an error indicating the job was not found

### Requirement: Kill background command

The system SHALL provide a `kill_command` tool that stops a background job by `jobId` and updates job status accordingly.

#### Scenario: Kill running job

- **WHEN** the model calls `kill_command` with the `jobId` of a running job
- **THEN** the process is terminated (best-effort including child processes on Node) and subsequent polls report a non-running terminal status

### Requirement: Job cleanup on environment teardown

When CoreEnv is destroyed or cleared (or the agent tears down the environment), the system SHALL stop tracked background jobs and release registry entries so processes do not outlive the session unintentionally.

#### Scenario: Destroy clears jobs

- **WHEN** `destroy` / `clearCoreEnv` runs while background jobs are registered
- **THEN** those jobs are killed or abandoned per adapter capability and are no longer queryable via `get_command_output`

### Requirement: Approval still applies to background starts

Background `run_command` invocations SHALL remain subject to the same approval policy as foreground shell execution (`needsApproval`).

#### Scenario: Background requires approval when policy demands it

- **WHEN** approval is required for shell tools and the model requests `run_in_background: true`
- **THEN** execution does not start until approval is granted (same gate as foreground)

### Requirement: Background job output is persisted to a per-job log file

While a background job runs, the system SHALL persist its stdout/stderr to a single durable log file per job at the workspace-relative path `.agents/cache/command-jobs/<jobId>.log`, appending chunks in arrival order. Lines originating from stderr SHALL be marked so the two streams stay distinguishable in the interleaved file.

#### Scenario: Output is written as it arrives

- **WHEN** a background job emits stdout and stderr chunks
- **THEN** those chunks appear in the job log in arrival order, with stderr-derived lines marked

#### Scenario: Output survives registry trimming

- **WHEN** a job's in-memory buffers exceed the registry's retention caps and the head is trimmed
- **THEN** the trimmed output is still present in the job log

#### Scenario: Host without append support

- **WHEN** the registered CoreEnv filesystem cannot append to files
- **THEN** no log is written, the command still runs normally, and no error is surfaced for the logging attempt

### Requirement: The job log is self-describing

The job log SHALL identify the command it belongs to, and SHALL receive a terminal footer recording the final status and exit code once the job exits, is killed, or fails. The absence of a terminal footer SHALL mean the job is still running (or terminated before it could be recorded).

#### Scenario: Exit writes a footer

- **WHEN** a background job exits with an exit code
- **THEN** the log ends with a footer containing the terminal status and the exit code

#### Scenario: Kill writes a footer

- **WHEN** a background job is killed
- **THEN** the log ends with a footer reporting the killed status

#### Scenario: Running job has no footer

- **WHEN** the model reads the log of a job that is still running
- **THEN** no terminal footer is present, so the reader can tell the job has not finished

### Requirement: The job log path is surfaced to callers

The system SHALL include the job log's workspace-relative path in the `run_command` background result and in `get_command_output` results, so callers that can read workspace files but cannot poll (for example the code-mode sandbox, which exposes `read_file` but not `get_command_output`) can read job output. When no log was written the field SHALL be null.

#### Scenario: Path returned when the job starts

- **WHEN** `run_command` starts a background job in a host that can write the log
- **THEN** the tool result carries the log path for that `jobId`

#### Scenario: Path returned on poll

- **WHEN** `get_command_output` is called for a job with a log
- **THEN** the result carries the same log path

#### Scenario: Unavailable log reports null

- **WHEN** the log could not be written for a job
- **THEN** the path field is null and the rest of the tool result is unaffected

### Requirement: Job log growth is bounded without moving the head

The system SHALL cap each job log at a fixed maximum size. On reaching the cap it SHALL stop appending, write a single truncation marker, and SHALL NOT discard or rewrite already-written content, so previously read offsets remain valid. Recent output beyond the cap SHALL remain available through `get_command_output`.

#### Scenario: Cap reached

- **WHEN** a job produces more output than the configured log cap
- **THEN** the log retains its beginning, contains exactly one truncation marker, and receives no further output

#### Scenario: Offsets stay stable

- **WHEN** a job log has reached its cap and the model re-reads an earlier section
- **THEN** the same lines are found at the same positions as before

### Requirement: Job log lifecycle is owned by the job record

The system SHALL create a job's log lazily on first output, SHALL delete it together with the job record (registry eviction or environment teardown), SHALL sweep stale logs left behind by earlier runs, and SHALL keep the job's log available after it is killed. Logging failures SHALL never fail or alter the command result.

#### Scenario: Eviction removes the log

- **WHEN** a finished job's registry record is evicted
- **THEN** its log file is removed

#### Scenario: Teardown removes logs

- **WHEN** background jobs are destroyed during environment teardown
- **THEN** their log files are removed

#### Scenario: Stale logs are swept

- **WHEN** a new background job starts in a workspace whose cache directory holds logs older than the staleness threshold
- **THEN** those stale logs are removed and logs within the threshold are left untouched

#### Scenario: Killed job keeps its log

- **WHEN** a job is killed and its record is still retained
- **THEN** its log remains readable

