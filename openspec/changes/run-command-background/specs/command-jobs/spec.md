## ADDED Requirements

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
