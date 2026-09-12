# middleware-phase-pipeline

## Purpose

Declared-phase assembly rules for the agent-run middleware pipeline: a four-stage phase vocabulary (observe / context-transform / tools / wire-annotate), stable phase-rank sorting in buildAgentRunner, dev-time warnings for undeclared phases, and a canonical order snapshot that locks the exact middleware sequence.

## Requirements

### Requirement: Declared middleware phases

Every agent-run middleware SHALL declare exactly one phase from the ordered vocabulary: `observe`, `context-transform`, `tools`, `wire-annotate`. The pipeline SHALL assemble middlewares sorted by phase rank, preserving declaration order within the same phase.

#### Scenario: Phase ordering matches responsibility split

- **WHEN** `buildAgentRunner` assembles the middleware pipeline
- **THEN** status/lifecycle observe first, compaction/tool-compact/turn-context transform context next, extensions/prefork/plan-mode tool-phase middlewares follow, and prompt-cache annotates last

#### Scenario: Resulting order equals the historical array

- **WHEN** the assembled pipeline order is compared against the pre-change array snapshot
- **THEN** the middleware name sequence is identical

### Requirement: Undeclared phases are rejected in development

A middleware without a declared phase SHALL cause a dev-time warning at assembly and SHALL fail the canonical order-snapshot validation.

#### Scenario: New middleware without phase

- **WHEN** a middleware without a `phase` declaration is added to the pipeline and the validation script runs
- **THEN** the script fails, naming the undeclared middleware

### Requirement: Canonical order snapshot

The repository SHALL maintain an order-snapshot validation listing the canonical middleware name sequence; the assembled pipeline MUST match it.

#### Scenario: Accidental reorder

- **WHEN** the pipeline assembly is modified such that the resolved order differs from the snapshot
- **THEN** the validation script fails, showing the divergent position
