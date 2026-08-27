# session-event-log

### Requirement: Durable session journal

The system SHALL maintain an append-only JSONL journal at `.agents/sessions/{id}.session.log` for each session, storing seq-numbered records. The journal SHALL be the crash-safe source of the session's latest state; the `.session.json` snapshot SHALL be a materialized cache of the journal's latest state.

#### Scenario: Journal file created on first save

- **WHEN** a session is saved for the first time
- **THEN** a `.session.log` file exists next to the session file and contains at least one record

### Requirement: Append-only whole-state checkpoints

Each `SessionStore.save()` SHALL append one durable record containing the full `SessionData`, a monotonically increasing `seq`, a record `kind`, and a timestamp, before any snapshot write is attempted.

#### Scenario: Save appends a record

- **WHEN** the agent persists a session after an interaction
- **THEN** the journal gains one record whose `seq` is greater than all previous records and whose data equals the saved session state

#### Scenario: No-op saves do not append

- **WHEN** save is called with a session whose content is unchanged since the last save
- **THEN** no new record is appended to the journal

### Requirement: Crash recovery via journal tail replay

`SessionStore.load()` SHALL read the `.session.json` snapshot, then replay any journal records with `seq` greater than the snapshot's recorded `seq`, so the returned `SessionData` reflects the latest durable state. If the snapshot is missing or unreadable but a journal exists, load SHALL rebuild the session from the newest whole-state record in the journal.

#### Scenario: Recover state after snapshot write failure

- **WHEN** the journal contains a record newer than the snapshot's recorded seq
- **THEN** load returns the state from the newest journal record

#### Scenario: Rebuild from journal when snapshot missing

- **WHEN** the snapshot file is missing but the journal exists
- **THEN** load returns the state from the newest whole-state journal record

#### Scenario: Snapshot-only file loads normally

- **WHEN** a session has a snapshot and no journal (legacy v4 file)
- **THEN** load returns the snapshot state unchanged

### Requirement: Bounded journal

The system SHALL keep the journal bounded by truncating records no newer than the last snapshot after a snapshot write. Truncation SHALL preserve all records newer than the snapshot seq.

#### Scenario: Truncate after snapshot

- **WHEN** a snapshot is written recording seq N
- **THEN** journal records with `seq <= N` are removed and records with `seq > N` remain
