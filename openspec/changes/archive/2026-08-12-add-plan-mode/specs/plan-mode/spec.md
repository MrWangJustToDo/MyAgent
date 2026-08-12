## ADDED Requirements

### Requirement: Plan mode phases
The system SHALL support plan mode phases `off`, `planning`, `ready`, and `executing` on the root ManagedAgent, with APIs to enable, disable, toggle, inspect state, and begin execution from `ready`.

#### Scenario: Enable planning
- **WHEN** the user enables plan mode while phase is `off`
- **THEN** phase becomes `planning` and a `plan:enter` event is emitted

#### Scenario: Disable from any phase
- **WHEN** the user disables plan mode
- **THEN** phase becomes `off`, mutate tools are available again, and a `plan:exit` event is emitted

### Requirement: Read-only tooling while planning
While phase is `planning` or `ready`, the system SHALL exclude mutate tools from the LLM tool list, block MCP tools, and allow `run_command` only when the command matches the read-only allowlist. A before-tool middleware SHALL skip forbidden tools with an error result if invoked.

#### Scenario: Write tool unavailable
- **WHEN** phase is `planning` and the model would call `write_file`
- **THEN** `write_file` is not offered in the tool list (and would be skipped if invoked)

#### Scenario: Unsafe shell blocked
- **WHEN** phase is `planning` and `run_command` is invoked with `rm -rf /tmp/x`
- **THEN** execution is skipped with a plan-mode error result

#### Scenario: Safe shell allowed
- **WHEN** phase is `planning` and `run_command` is invoked with `git status`
- **THEN** the command is allowed to run

### Requirement: Plan artifact extraction
After an assistant turn in `planning`, the system SHALL attempt to extract a plan section (`## Plan` or `Plan:`) with numbered steps. On success, phase becomes `ready`, plan markdown is stored, TodoManager is seeded with pending steps, and `plan:ready` is emitted.

#### Scenario: Numbered plan becomes ready
- **WHEN** the assistant outputs a `## Plan` section with steps `1.` and `2.`
- **THEN** phase is `ready` and TodoManager contains two pending items

### Requirement: Execute handoff
When the user begins plan execution from `ready`, the system SHALL set phase to `executing`, restore full tools (including MCP), emit `plan:execute`, and instruct the agent to execute the approved plan step-by-step.

#### Scenario: Execute from ready
- **WHEN** phase is `ready` and the user runs `/plan execute`
- **THEN** phase is `executing` and mutate tools are available again

### Requirement: App commands and status
The app SHALL provide `/plan` (toggle), `/plan execute`, and `/plan status`, and SHALL show plan phase (and progress when executing) in the Footer.

#### Scenario: Status command
- **WHEN** the user runs `/plan status` while planning
- **THEN** the command reports phase `planning`
