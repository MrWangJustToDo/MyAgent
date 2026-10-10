## RENAMED Requirements

- FROM: `### Requirement: Guidance states how each on-disk shape is read`
- TO: `### Requirement: Guidance states how past conversation is read`

## MODIFIED Requirements

### Requirement: Retrieval guidance has a single home

The system SHALL state how to search past conversation in exactly one place — a turn-context section — and SHALL NOT also state it in the compaction summary or in shipped project instructions.

#### Scenario: Guidance is emitted as its own section

- **WHEN** a session runs in a workspace that has conversation history
- **THEN** the dynamic turn context includes a `session_retrieval` section, injected like any other turn-context kind

#### Scenario: Other sites carry no usage guidance

- **WHEN** a compaction summary is produced
- **THEN** it contains no instructions for searching past conversation

### Requirement: Guidance is emitted only when history exists

The system SHALL omit the retrieval section when the workspace has no conversation history, and SHALL NOT probe for history on every turn.

#### Scenario: Fresh workspace

- **WHEN** the workspace has no session logs
- **THEN** no `session_retrieval` section is emitted, and the other turn-context sections are unaffected

#### Scenario: Existence is evaluated once per agent

- **WHEN** the section has been admitted for an agent
- **THEN** it is not recomputed per turn, so creating or removing a session does not change the section's content

#### Scenario: An empty sessions directory is not history

- **WHEN** the sessions directory exists but contains nothing
- **THEN** no section is emitted

### Requirement: Guidance states how past conversation is read

The retrieval section SHALL state that past conversations are complete session logs on disk and
SHALL name the `session_search` / `session_read` tools as the way to search and read them.

#### Scenario: Session logs are the complete record

- **WHEN** the section is rendered
- **THEN** it states that a session log is `.agents/sessions/<id>.session.jsonl`, one message per
  line, and holds the whole conversation — including parts the current context has compacted away

#### Scenario: The tool is the primary path

- **WHEN** the section is rendered
- **THEN** it tells the agent to use `session_search` (and `session_read` to read a session) rather
  than grepping the raw session logs by hand

#### Scenario: The current session is excluded

- **WHEN** the section is rendered
- **THEN** it states that the current session's own files are already represented by the live
  conversation, so re-reading them duplicates context

## REMOVED Requirements

### Requirement: The current session's archives are supplied by the summary, not the section

**Reason**: The transcript archive was removed (see the removed `compaction-archive` capability); the session log is the complete record, so there is no per-session archive list for the summary to carry.

**Migration**: None. Recall of compacted-away detail goes through `session_search` / `session_read` over the session log.
