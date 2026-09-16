# session-retrieval

How the agent is told that past conversations are reachable, and how it is told to read them.

## ADDED Requirements

### Requirement: Retrieval guidance has a single home

The system SHALL state how to search past conversation in exactly one place — a turn-context section — and SHALL NOT also state it in the compaction summary, in the archive file header, or in shipped project instructions.

#### Scenario: Guidance is emitted as its own section

- **WHEN** a session runs in a workspace that has conversation history
- **THEN** the dynamic turn context includes a `session_retrieval` section, injected like any other turn-context kind

#### Scenario: Other sites carry no usage guidance

- **WHEN** a compaction summary or an archive file is produced
- **THEN** neither contains instructions for searching archives — the summary carries path data and a scope statement, and the archive carries only its own metadata and body

### Requirement: Guidance is emitted only when history exists

The system SHALL omit the retrieval section when the workspace has no conversation history, and SHALL NOT probe for history on every turn.

#### Scenario: Fresh workspace

- **WHEN** the workspace has neither a sessions directory nor any compacted archive
- **THEN** no `session_retrieval` section is emitted, and the other turn-context sections are unaffected

#### Scenario: Existence is evaluated once per agent

- **WHEN** the section has been admitted for an agent
- **THEN** it is not recomputed per turn, so creating or removing a session does not change the section's content

#### Scenario: An empty sessions directory is not history

- **WHEN** the sessions directory exists but contains nothing
- **THEN** no section is emitted

### Requirement: Guidance states how each on-disk shape is read

The retrieval section SHALL describe both shapes of past conversation and the difference in how they are read.

#### Scenario: Compacted slices

- **WHEN** the section is rendered
- **THEN** it states that `compact-<N>.md` slices are plain text that can be grepped directly, and that the highest `N` holds the most recent details, so newest should be searched first

#### Scenario: Uncompacted sessions

- **WHEN** the section is rendered
- **THEN** it states that a session file holds a whole conversation as a single long JSON line, that grep therefore only identifies *which* session matched, and that reading one requires parsing the JSON and filtering messages by role

#### Scenario: The current session is excluded

- **WHEN** the section is rendered
- **THEN** it states that the current session's own files are already represented by the live conversation, so re-reading them duplicates context

### Requirement: Guidance is stable across turns

The section content SHALL NOT vary with volatile or per-session state, so that a single admission settles it and it does not invalidate the prompt cache or re-inject repeatedly.

#### Scenario: No volatile figures

- **WHEN** the section is rendered
- **THEN** it contains no counts, timestamps, or other values that change as sessions are created or pruned

#### Scenario: No per-session content

- **WHEN** the current session compacts and gains an archive
- **THEN** the rendered section is unchanged, because the section depends only on whether workspace history exists

#### Scenario: Repeated evaluation is byte-identical

- **WHEN** the section is computed twice in the same workspace
- **THEN** both renderings are byte-identical

### Requirement: The current session's archives are supplied by the summary, not the section

The system SHALL NOT name the current session's archive paths in the retrieval section, because the compaction summary already lists them, and naming them here would re-inject the section on every compaction.

#### Scenario: Paths come from the summary

- **WHEN** the current session has compacted
- **THEN** its archive paths appear in the summary's `## Compact archives` list, and the retrieval section contains no concrete session path and no per-session path list

#### Scenario: The guidance survives the summary moving

- **WHEN** further compaction removes earlier turns, moving the summary's archive list
- **THEN** the retrieval section still states where this session's slices live and how to search them, so the guidance does not depend on the list's position

### Requirement: Subagents do not receive the guidance

The retrieval section SHALL NOT be injected for subagents.

#### Scenario: Subagent turn context

- **WHEN** a subagent assembles its turn context
- **THEN** the `session_retrieval` kind is filtered out, because cross-session recall is a root-agent decision
