## MODIFIED Requirements

### Requirement: Read-only tooling while planning
While phase is `planning` or `ready`, the system SHALL exclude mutate tools (`write_file`, `edit_file`, `delete_file`, `kill_command`) from the LLM tool list, block MCP tools, and allow `run_command` only when the command matches the read-only allowlist. The system SHALL keep the `task` tool available so the agent can spawn read-only exploration subagents. A before-tool middleware SHALL skip forbidden tools with an error result if invoked.

#### Scenario: Write tool unavailable
- **WHEN** phase is `planning` and the model would call `write_file`
- **THEN** `write_file` is not offered in the tool list (and would be skipped if invoked)

#### Scenario: Task tool available for exploration
- **WHEN** phase is `planning`
- **THEN** `task` is offered in the tool list and may run read-only subagents

#### Scenario: Unsafe shell blocked
- **WHEN** phase is `planning` and `run_command` is invoked with `rm -rf /tmp/x`
- **THEN** execution is skipped with a plan-mode error result

#### Scenario: Safe shell allowed
- **WHEN** phase is `planning` and `run_command` is invoked with `git status`
- **THEN** the command is allowed to run

## ADDED Requirements

### Requirement: Plan-mode exploration guidance
While phase is `planning`, the dynamic plan-mode prompt SHALL instruct the agent to prefer `task` for parallel codebase exploration, stay read-only, ask clarifying questions when requirements are ambiguous, and produce a plan with goals, key files, numbered steps, risks, and verification notes (mermaid optional).

#### Scenario: Planning prompt mentions task
- **WHEN** phase is `planning` and the agent builds turn context
- **THEN** the plan-mode prompt content references using `task` for exploration

### Requirement: Structured plan tools
The system SHALL provide `create_plan` and `update_plan` tools available during `planning` and `ready`. Successful `create_plan` / `update_plan` SHALL store plan markdown and steps on the PlanModeController, seed TodoManager when appropriate, transition phase to `ready` when steps are present, and emit `plan:ready`. Markdown `## Plan` extraction SHALL remain as a fallback when the model does not call these tools.

#### Scenario: create_plan becomes ready
- **WHEN** phase is `planning` and `create_plan` is invoked with at least one step
- **THEN** phase becomes `ready` and the plan steps are available via plan state

#### Scenario: Markdown fallback still works
- **WHEN** phase is `planning` and the assistant outputs a `## Plan` section with numbered steps without calling `create_plan`
- **THEN** phase becomes `ready` as in the prior plan-artifact extraction behavior

### Requirement: Ready-state review actions
When phase is `ready`, the app SHALL present clear actions to execute the plan, keep revising (stay read-only), or exit plan mode — in addition to `/plan execute` / `/plan`.

#### Scenario: Ready footer or banner mentions execute
- **WHEN** phase is `ready`
- **THEN** the UI indicates how to execute (e.g. `/plan execute` or an Execute affordance)

### Requirement: Clarifying questions before plan finalization
During `planning`, the agent SHALL be able to ask structured clarifying questions (via tool or prompt convention). The app SHALL surface those questions to the user and accept answers before or while the plan is finalized. Skipping answers SHALL NOT permanently block planning.

#### Scenario: User answers clarifying questions
- **WHEN** the agent asks clarifying questions in plan mode and the user replies
- **THEN** the agent continues planning with the answers as context

### Requirement: Keyboard toggle for plan mode
The app SHALL support a keyboard shortcut (Shift+Tab by default) to toggle plan mode when the chat input is focused, equivalent to `/plan` toggle, without requiring a slash command.

#### Scenario: Shift+Tab enables plan mode
- **WHEN** plan phase is `off` and the user presses Shift+Tab in the chat input
- **THEN** phase becomes `planning`

### Requirement: Persist plan markdown
The system SHALL support saving the current plan to `.agents/plans/` (or equivalent workspace path) as markdown and loading a saved plan back into plan state for review / execute.

#### Scenario: Save plan to workspace
- **WHEN** a plan is ready and the user saves it
- **THEN** a markdown file is written under `.agents/plans/`

#### Scenario: Load plan from workspace
- **WHEN** the user loads a saved plan file
- **THEN** plan state reflects that plan and phase is `ready` (or equivalent reviewable state)
