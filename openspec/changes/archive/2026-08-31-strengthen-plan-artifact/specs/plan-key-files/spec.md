## ADDED Requirements

### Requirement: Plan authoring requires key files

The system MUST require at least one key file when creating or updating a plan via `create_plan` or `update_plan`. The `key_files` input MUST be a non-empty array of file paths the plan will touch or rely on. Tool execute MUST reject empty or missing `key_files` without transitioning to ready.

#### Scenario: create_plan rejects missing key files

- **WHEN** the agent calls `create_plan` without any `key_files`
- **THEN** the tool MUST fail validation or return an error without saving the plan or transitioning to ready

#### Scenario: create_plan accepts key files

- **WHEN** the agent calls `create_plan` with goal, steps, a non-empty `key_files` list, and a usable verification checklist
- **THEN** the plan is saved with the Key files section present in the plan markdown and plan mode MAY enter ready

### Requirement: Plan prompts enforce key-file-driven work

While plan mode is active, dynamic prompts MUST instruct the agent to: (1) in planning, list 3-5 key files the plan will touch or rely on before calling `create_plan`; (2) in executing, read the plan's Key files first before editing, using them as file anchors for the work.

#### Scenario: planning prompt requires key files

- **WHEN** plan mode phase is `planning`
- **THEN** the turn-context plan prompt MUST instruct the agent to output 3-5 key files as part of the plan

#### Scenario: executing prompt mentions key files

- **WHEN** plan mode phase is `executing`
- **THEN** the turn-context plan prompt MUST instruct the agent to read the plan's Key files first before making changes

### Requirement: Free-form plan text is guided, not hard-gated

The `## Plan` markdown fallback path (no `create_plan` call) MUST NOT hard-fail when no Key files section is present, because only `create_plan`/`update_plan` can validate `key_files`. Planning guidance SHOULD still direct the agent to include a Key files list in free-form plan text.

#### Scenario: free-form plan without key files still applies

- **WHEN** the agent writes a `## Plan` section without a Key files list during planning
- **THEN** the plan still applies and plan mode MAY enter ready, without a hard validation error
