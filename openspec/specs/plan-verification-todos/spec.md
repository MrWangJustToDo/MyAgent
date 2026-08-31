# plan-verification-todos

Plan Verification checklist items MUST seed as plan todos so verification progress is tracked incrementally during execution, while the `complete_plan` gate stays evidence-based.

## Requirements

### Requirement: Verification checklist items seed as plan todos

When a plan is applied with a Verification section, the system MUST parse the Verification checklist items (via `parseVerificationItemsFromText`) and seed them as plan todos alongside the step todos. The todos MUST be distinguished as verification items (not steps) so execution can track each checklist item individually.

#### Scenario: plan with verification seeds verification todos

- **WHEN** a plan containing a Verification checklist is applied and the plan has todos seeded
- **THEN** each parsed verification item MUST be present as a plan todo alongside the step todos

#### Scenario: plan without verification seeds only steps

- **WHEN** a plan with no Verification section is applied
- **THEN** only step todos are seeded and no verification todos are added

### Requirement: Executing prompt tracks verification todos per item

While plan mode phase is `executing`, the turn-context plan prompt MUST instruct the agent to mark each Verification todo when its check is performed and passed, so verification progress is tracked incrementally during execution.

#### Scenario: executing prompt mentions verification todos

- **WHEN** plan mode phase is `executing` and the plan has verification todos
- **THEN** the turn-context plan prompt MUST instruct the agent to run and mark each Verification todo with evidence before finishing

### Requirement: complete_plan gating remains evidence-based

The `complete_plan` gate MUST keep requiring structured `verificationResults` (item, passed, evidence) covering the plan Verification items, regardless of verification todo check state. Verification todos are a progress-tracking aid and MUST NOT replace the evidence-based gate.

#### Scenario: complete_plan still needs evidence

- **WHEN** all verification todos are checked but the agent calls `complete_plan` without covering `verificationResults` with evidence
- **THEN** the tool MUST still reject completion as today

#### Scenario: retro entered after verification todos complete

- **WHEN** execution finishes and both step todos and verification todos are completed
- **THEN** plan mode MAY enter retro as today (all todos completed triggers retro)
