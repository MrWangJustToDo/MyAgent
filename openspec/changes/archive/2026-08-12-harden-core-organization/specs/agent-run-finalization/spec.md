## ADDED Requirements

### Requirement: Single run finalization entry
The core runtime SHALL finalize every agent run (main chat tool-phase pump and detached / subagent streams) through one shared finalization entry that accepts a typed run outcome.

#### Scenario: Chat pump completion uses shared finalize
- **WHEN** the main chat controller finishes a pump iteration that ends the run
- **THEN** it MUST invoke the shared finalization entry with an outcome kind reflecting finished, aborted, error, or waiting

#### Scenario: Detached subagent completion uses shared finalize
- **WHEN** a detached or bridged subagent stream ends
- **THEN** it MUST invoke the same shared finalization entry (directly or via an equivalent thin wrapper) rather than a divergent ad-hoc status path

### Requirement: Outcome-driven status reconciliation
The shared finalization path SHALL derive status reconciliation policy from the run outcome kind (or a named policy mapped from that kind), instead of scattering incompatible `whenClear` literals across call sites.

#### Scenario: Waiting outcome preserves wait semantics
- **WHEN** finalization receives outcome kind `waiting`
- **THEN** agent status MUST remain consistent with pending approval or client-tool wait and MUST NOT be forced to idle solely by a generic clear policy

#### Scenario: Finished detached run clears to a completed/idle policy
- **WHEN** finalization receives outcome kind `finished` for a detached run
- **THEN** status reconciliation MUST apply the detached completion policy defined by the shared entry

### Requirement: Validation for finalization kinds
The package SHALL provide a validation script that exercises shared finalization for at least finished and waiting (or aborted) outcomes so regressions in dual-path drift are caught in CI/local validates.

#### Scenario: Validate script passes after wiring
- **WHEN** a developer runs the designated finalization validate script after build
- **THEN** the script MUST assert distinct outcome kinds produce the expected status transitions without failing
