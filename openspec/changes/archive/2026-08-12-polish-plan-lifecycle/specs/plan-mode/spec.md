## ADDED Requirements

### Requirement: Auto-persist plan on create or update
When a plan artifact is successfully applied via `create_plan`, `update_plan`, or markdown `## Plan` extraction while phase is `planning` or `ready`, the system SHALL write the plan markdown under `.agents/plans/` (creating the directory if needed), record the active plan file path on plan state, and overwrite that file on subsequent updates in the same plan session unless the user explicitly saves under a new name.

#### Scenario: create_plan writes a plan file
- **WHEN** phase is `planning` and `create_plan` succeeds with at least one step
- **THEN** a markdown file exists under `.agents/plans/` and plan state exposes its path

#### Scenario: update_plan overwrites the active file
- **WHEN** phase is `ready` with an active plan file path and `update_plan` succeeds
- **THEN** that file's contents reflect the updated plan markdown

### Requirement: Static plan summary in the transcript
After a successful `create_plan` or `update_plan`, the tool result shown to the user and the model-facing summary SHALL include the plan file path, the goal, and a numbered list of step titles in a bounded static text block. The app SHALL NOT introduce a focusable or independently scrollable plan panel for this summary.

#### Scenario: Summary lists steps without a scroll panel
- **WHEN** `create_plan` completes successfully
- **THEN** the visible tool output includes the saved path, goal, and numbered step titles, and no dedicated scrollable plan viewport is required to read that summary

### Requirement: Phase display aligned with review and build
While plan mode is active, the app footer (and ready banner when applicable) SHALL indicate the current lifecycle phase using clear labels equivalent to exploring/planning, review, building (with todo progress when available), and retro — so users can tell they are in a mode phase, not a generic hint. `/plan execute` SHALL remain the Build action that transitions from review (`ready`) to building (`executing`) without an additional confirmation dialog.

#### Scenario: Review phase copy mentions execute as Build
- **WHEN** phase is `ready`
- **THEN** the UI indicates review/ready state and how to start building via `/plan execute` (or equivalent)

#### Scenario: Building shows progress
- **WHEN** phase is `executing` and plan todos exist
- **THEN** the footer shows building-style progress (e.g. completed/total), not only the word `plan`

### Requirement: Richer plan todo presentation while building
When the agent is building an approved plan and todos are seeded from plan steps, the todo presentation SHALL show step-oriented progress (including step numbering or clear ordering and completion state) suitable for tracking the plan, distinct from a bare undifferentiated checklist where practical.

#### Scenario: Plan-seeded todos show ordered progress
- **WHEN** phase is `executing` and plan steps were seeded into the todo list
- **THEN** the todo UI presents those items with clear order/status for plan tracking

### Requirement: Forced retrospective then plan completion
When phase is `executing` and all plan-seeded todos are completed, the system SHALL transition to a `retro` phase and prompt the agent to retrospectively review outcomes against the active plan (what was done, deviations, verification). The system SHALL NOT leave plan mode solely because todos completed. Plan mode SHALL exit to `off` only after an explicit plan completion action (`complete_plan` tool or `/plan done`), which SHALL end the current plan lifecycle.

#### Scenario: All todos done enters retro
- **WHEN** phase is `executing` and every plan-seeded todo becomes completed
- **THEN** phase becomes `retro` and the agent receives retrospective guidance referencing the plan

#### Scenario: Completion exits plan mode
- **WHEN** phase is `retro` and the user or agent completes the plan via the supported completion action
- **THEN** phase becomes `off` and the plan lifecycle for that run is finished

## MODIFIED Requirements

### Requirement: Persist plan markdown
The system SHALL support saving the current plan to `.agents/plans/` as markdown and loading a saved plan back into plan state for review / execute. Successful `create_plan` / `update_plan` (and markdown plan extraction that becomes ready) SHALL auto-persist as specified in Auto-persist plan on create or update. Explicit `/plan save` SHALL remain available for named save or copy.

#### Scenario: Save plan to workspace
- **WHEN** a plan is ready and the user saves it explicitly
- **THEN** a markdown file is written under `.agents/plans/`

#### Scenario: Load plan from workspace
- **WHEN** the user loads a saved plan file
- **THEN** plan state reflects that plan and phase is `ready` (or equivalent reviewable state)

#### Scenario: Auto-persist without explicit save
- **WHEN** `create_plan` succeeds
- **THEN** the plan is already persisted under `.agents/plans/` without requiring `/plan save`
