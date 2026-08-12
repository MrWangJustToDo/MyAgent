## ADDED Requirements

### Requirement: Plan authoring requires verification checklist

The system MUST require a non-empty Verification checklist when creating or updating a plan via `create_plan` or `update_plan`. Tool execute MUST NOT hardcode rejection of specific command names (e.g. lint/format/build); prompts SHOULD guide the agent toward outcome-proving checks.

#### Scenario: create_plan rejects missing verification

- **WHEN** the agent calls `create_plan` without a usable verification checklist
- **THEN** the tool MUST fail validation or return an error without transitioning to ready

#### Scenario: create_plan accepts checklist verification

- **WHEN** the agent calls `create_plan` with goal, steps, and a non-empty verification checklist
- **THEN** the plan is saved and plan mode MAY enter ready with Verification present in the plan markdown

### Requirement: Plan prompts enforce verification-driven work

While plan mode is active, dynamic prompts MUST instruct the agent to: (1) in planning, not call `create_plan` until Verification is ready and not finalize a plan solely from truncated or rate-limited exploration; (2) in executing, run Verification items before treating the build as done; (3) in retro, report each Verification item as pass/fail with evidence before `complete_plan`.

#### Scenario: executing prompt mentions verification

- **WHEN** plan mode phase is `executing`
- **THEN** the turn-context plan prompt MUST mention running the plan Verification checklist with evidence

#### Scenario: retro prompt requires per-item results

- **WHEN** plan mode phase is `retro`
- **THEN** the turn-context plan prompt MUST require per-item verification pass/fail with evidence before `complete_plan`

### Requirement: complete_plan is gated on verification results

When the agent calls `complete_plan` in retro, the tool MUST accept structured `verificationResults` (item, passed, evidence). The tool MUST reject completion when results are missing, do not cover the plan Verification items, or any item has `passed: false`. A user-initiated force exit (e.g. `/plan done`) MAY still end plan mode without this gate.

#### Scenario: complete_plan rejected on failed item

- **WHEN** the agent calls `complete_plan` with a verification result where `passed` is false
- **THEN** the tool MUST return an error and MUST NOT exit plan mode

#### Scenario: complete_plan succeeds when all items pass

- **WHEN** the agent calls `complete_plan` with results covering each Verification item and every `passed` is true with non-empty evidence
- **THEN** plan mode exits (complete/disable) as today

#### Scenario: user force-done still works

- **WHEN** the user runs the force-done plan command while in retro or executing
- **THEN** plan mode MAY exit without requiring `verificationResults`

### Requirement: Incomplete exploration must not finalize plans

Planning guidance MUST tell the agent to judge `task` results via completion status flags (`reachedLimit`, `incomplete`, `aborted`, `truncated`) and not call `create_plan` from incomplete/untrustworthy research until a successful narrower exploration completes. The `task` tool MUST expose those flags to the model (`toModelOutput`) and describe how to interpret them.

#### Scenario: task description warns about truncated research

- **WHEN** an agent reads the `task` tool description
- **THEN** it MUST include guidance to treat findings as trustworthy/extendable only when task status indicates a clean completion
