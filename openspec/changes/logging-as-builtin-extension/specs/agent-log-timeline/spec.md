## MODIFIED Requirements

### Requirement: Log core is persistence-only

The log emission seam SHALL be persistence-only: every accepted entry is handed to the log extension for writing and nothing else. It MUST NOT maintain an unbounded in-memory entries ring or expose query APIs (`getEntries`, `getCount`, `filter`, `recent`, `errors`, `issues`), console output (`toConsole`), or serialization helpers (`toJSON`, `fromJSON`, `toString`).

The seam MAY retain a bounded pending buffer of entries emitted before the log extension has bound a sink, and MUST drain and discard that buffer at its cap so a session with no bound sink cannot grow memory without bound. Entries retained this way SHALL be written once a sink is bound, and MUST NOT be replayed more than once. Once a sink is bound, entries flow to it directly with no queryable history retained.

#### Scenario: No in-memory accumulation
- **WHEN** a long-running session produces more entries than any fixed buffer size
- **THEN** the log object's memory footprint stays constant (only the pending buffer bounded by its cap and the transient flush buffer grow) and all entries are present in the JSONL file

#### Scenario: Pending buffer is bounded when no sink is bound
- **WHEN** an agent emits entries and no sink is ever bound
- **THEN** the retained pending buffer does not grow past its cap and the process does not accumulate entries without bound

#### Scenario: Entries emitted before the sink is bound are not lost
- **WHEN** entries are emitted during agent construction, before the log extension has bound a sink
- **THEN** those entries appear in the persisted log once the sink is bound, and appear exactly once

### Requirement: Bootstrap logging is single-sourced

Session bootstrap information (instructions loaded, skills loaded, memory initialized, extensions activated, extension activation failures, session start) SHALL be recorded exactly once per launch: either as `session:*` lifecycle events through the log extension, or as direct seam calls that are not duplicated by those events. Direct `log.*` calls in the agent factory that duplicate a `session:*` event MUST be removed, replaced by at most one aggregated bootstrap summary entry.

Bootstrap entries emitted before the log extension binds its sink MUST NOT be discarded: the persisted log for a launch MUST contain the activation-failure entries for every extension that failed to activate in that launch.

#### Scenario: One bootstrap does not duplicate skill/memory lines
- **WHEN** a new agent session boots with N skills and M memories
- **THEN** the log contains the `session:skill` / `session:memory` / `session:start` entries and no duplicate direct `system`-category entries for the same facts

#### Scenario: Extension activation failures are visible in the log
- **WHEN** a session boots and one extension fails to activate
- **THEN** the persisted log for that launch contains the activation-failure entry, even though the entry is emitted before the log extension binds its sink

#### Scenario: Bootstrap summary appears once
- **WHEN** a session boots successfully
- **THEN** the persisted log contains at most one aggregated bootstrap summary entry and no per-fact duplicates of the `session:*` entries
