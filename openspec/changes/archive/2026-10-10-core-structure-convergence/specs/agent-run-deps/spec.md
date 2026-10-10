## ADDED Requirements

### Requirement: The runner is assembled from one dependency bag

`buildAgentRunner` SHALL receive its collaborators through a single `AgentRunDeps` object built by
`buildManagedAgentDeps`, and the assembly SHALL NOT reach into `managed` for a collaborator that the
bag already exposes. The bag SHALL be complete in both directions: every declared field SHALL have a
reader, and every collaborator the middleware factories need SHALL be on the bag. A field that
survives after its last reader moves elsewhere is the failure mode this prevents — it makes the bag
look complete while the assembly quietly reads an agent accessor instead.

#### Scenario: Assembling the middleware pipeline

- **WHEN** `buildAgentRunner` builds the pipeline
- **THEN** every collaborator it needs comes from the `AgentRunDeps` bag, and no factory argument performs its own `managed.getX()` lookup for one

#### Scenario: Auditing bag completeness

- **WHEN** the declared `AgentRunDeps` fields are compared against the fields the assembly actually reads
- **THEN** there are no declared-but-unread fields and no collaborator read from `managed` instead of the bag

### Requirement: The dependency bag preserves liveness under the runner cache

The runner SHALL be cached and reused while its config key is unchanged, and `AgentRunDeps` SHALL
reflect that: a collaborator assigned once during construction and never replaced MAY be captured as
a plain field, while anything that can change while the cached runner is alive (the log sink, the
models.dev lookup that lands after the first turn, and all conversation state) SHALL be exposed as a
`getX()` accessor and read at the consumer. The cache key SHALL be derived from the inputs that
require a rebuild — the tool set, model, sampling settings and plan phase — and a change to any of
them SHALL rebuild; a change to none of them SHALL reuse.

Capturing a live value as a field is the bug this shape prevents: the runner outlives the build, so a
snapshot would hand middleware a stale reference for the life of the cache.

#### Scenario: Reusing a cached runner

- **WHEN** a run starts and the config key (tool set, model, sampling, plan phase) is unchanged since the last build
- **THEN** the previously built runner is reused and no rebuild occurs

#### Scenario: Invalidating the runner

- **WHEN** the tool set, model, sampling settings, or plan phase changes
- **THEN** the config key changes and the next run rebuilds the runner from a fresh `AgentRunDeps`

#### Scenario: Reading a changeable collaborator

- **WHEN** middleware reads conversation state, the log sink, or model info during a run
- **THEN** it reads through the `getX()` accessor and observes the current value, not the value captured when the runner was built
