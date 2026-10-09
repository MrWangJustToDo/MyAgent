## ADDED Requirements

### Requirement: Log policy is owned by a built-in extension

The system SHALL provide a built-in log extension (`createLogExtension`) that owns log **policy**: the event→entry rule table, per-event message formatting, payload summarizing, the JSONL file sink, size-based rotation, session-boundary markers, and JSONL validation of accepted entries. Core MUST NOT retain a second owner of that policy. Log policy MUST be reachable through the extension registration surface used by every other built-in extension.

The on-disk product contract SHALL NOT change as part of this move: entry field names, `level` / `category` vocabularies, the `.agents/logs/<sessionId>/agent.log` path shape, `agent.log.{n}` rotation files, the 5 MiB / 5 file / 250 ms defaults, and the session-boundary divider line MUST be identical before and after.

#### Scenario: Policy is enforced at the extension boundary
- **WHEN** a bus event with a rule that suppresses it (for example `memory:prefetch`) is emitted
- **THEN** no entry for that event reaches the file, and the suppression is decided by the log extension rather than by the emitter

#### Scenario: Product contract is unchanged
- **WHEN** a session is run to completion after the move
- **THEN** `.agents/logs/<sessionId>/agent.log` contains the same entry shapes, `level` / `category` values, path, rotation filenames and boundary divider it contained before, and every existing log validator passes against the extension's surface

#### Scenario: Entry accepted by the persisted schema
- **WHEN** the log extension admits an entry for writing
- **THEN** the entry MUST validate against the persisted log-entry schema, and an entry that fails validation MUST be rejected rather than written

### Requirement: Log entries are emitted through a non-removable seam

Logging MUST remain available when no extension is active: during workspace/agent construction, before extension loading, and while an extension is failing to activate. Core SHALL therefore keep a thin always-on emission seam that performs level filtering and envelope construction and calls the log extension's sink — and this seam MUST NOT be an extension itself, MUST NOT be disableable, and MUST NOT require an activated extension to function.

A failure inside the log extension MUST NOT prevent the agent from running: a log-persistence failure SHALL be non-fatal and MUST NOT propagate into the agent loop.

#### Scenario: Extension activation failure is still recorded
- **WHEN** an extension fails to activate and core records the failure through the seam
- **THEN** the failure appears in the persisted log, even though the log extension is itself an extension

#### Scenario: Seam is not an extension
- **WHEN** a consumer inspects the registered extensions
- **THEN** the emission seam is not among them, and disabling every registered extension does not remove the ability to record that they were disabled

#### Scenario: Log failure does not break the run
- **WHEN** the log extension's write path throws or its environment lacks the filesystem primitives it needs
- **THEN** the agent run completes normally and the failure does not surface as a run error

### Requirement: Log resolution is bound per agent by core

Because session identity is core's and changes on resume, core SHALL own **resolution** — which agent's log an entry belongs to, and the session-derived directory — and SHALL pass the binding to the log extension. The log extension SHALL own **presentation** (filename, path shape within the bound directory, rotation, boundary markers). A subagent's entries SHALL be written to an independent file inside its owning session's directory.

#### Scenario: Resumed session appends to the same file
- **WHEN** a session is restored and the agent resumes under the same session id
- **THEN** the log extension writes to the session's existing directory and file, with a session-boundary divider rather than a new directory

#### Scenario: Subagent gets its own file in the parent directory
- **WHEN** a subagent emits entries
- **THEN** they are written to a file named for the subagent inside the parent session's log directory, and the parent's file is unaffected

### Requirement: The log consumer is the only wildcard subscriber

The event→entry consumer SHALL be the only subscriber in the system that consumes every observable event. It MUST NOT receive internal events, and it MUST NOT be delivered the entries it produces itself — the seam-to-extension handoff SHALL be a direct call, so a self-observation is impossible by construction rather than prevented by a delivery filter. No other core or built-in component SHALL subscribe to all events. Internal exclusion, where it applies to event-driven observation, SHALL be applied by the bus's wildcard fan-out rather than by each subscriber filtering what it receives.

#### Scenario: The seam cannot feed itself
- **WHEN** the seam hands an assembled entry to the log extension's sink
- **THEN** no event is emitted on the bus, so the consumer cannot receive the entry it just wrote

#### Scenario: One wildcard subscriber
- **WHEN** a consumer inspects every wildcard subscription in the repository
- **THEN** exactly one exists and it belongs to the event→entry consumer

#### Scenario: An internal event must not carry an entry rule
- **WHEN** an event is classified `internal` and the event→entry rule table assigns it a rule
- **THEN** the system is in an inconsistent state — the rule can never run, because wildcard delivery withholds internal events — and a validator MUST fail, so the classification and the rule table cannot silently disagree

### Requirement: Log entries survive process exit

The log extension's buffered entries SHALL be durably flushed before core releases the resources the extension writes through, and SHALL have a synchronous best-effort path for hard process exit and fatal-error handling.

#### Scenario: Teardown flush happens before sink release
- **WHEN** an agent is destroyed while the log extension holds buffered entries
- **THEN** those entries are written to the file before the extension's write resources are released

#### Scenario: Hard exit keeps pending entries
- **WHEN** the process exits through the fatal-error guard or `process.exit` while entries are buffered
- **THEN** a synchronous flush writes the pending entries, and the fatal entry itself is among them
