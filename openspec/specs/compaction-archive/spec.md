# compaction-archive Specification

## Purpose

Define the artifact compaction writes conversation into: a self-describing plain-text archive that can be grepped, the summary list that indexes this session's archives, and the guarantee that neither carries usage guidance (which belongs to `session-retrieval`).
## Requirements
### Requirement: Compacted conversation is written as a greppable plain-text archive

When a session compacts, the system SHALL write the compressed slice to a workspace-relative markdown file that is plain text and line-oriented, so it can be searched with grep.

#### Scenario: Archive location and naming

- **WHEN** a compaction writes an archive
- **THEN** it is written under a per-session directory, named `compact-<N>.md`, with `N` ascending from the existing archives in that directory so an archive is never overwritten

#### Scenario: Archive write failure is non-fatal

- **WHEN** writing the archive fails
- **THEN** the compaction still completes, and any previously known archive paths remain attached to the summary

### Requirement: An archive is self-describing and carries no usage guidance

The archive file SHALL begin with its own metadata and then the conversation body, and SHALL NOT contain instructions for how to read or search it.

#### Scenario: Header contents

- **WHEN** an archive is written
- **THEN** its header records the session id, the sequence number, a timestamp, and the cut index, and the remainder is the serialized conversation

#### Scenario: No search instructions in the file

- **WHEN** an archive is written
- **THEN** it contains no guidance such as preferring grep or warnings against loading the file, because the model only opens it after following the retrieval guidance

#### Scenario: Existing archives are not rewritten

- **WHEN** the header format changes
- **THEN** archives already on disk are left as they are, since they record past sessions and are immutable

### Requirement: The summary lists this session's archives with its scope stated

The compaction summary SHALL carry a list of the current session's archive paths, SHALL state that the list is scoped to the current session, and SHALL NOT carry instructions for searching archives.

#### Scenario: List content and ordering

- **WHEN** a summary is produced and the session has archives
- **THEN** the list names each archive path oldest → newest and does not repeat the search guidance owned by the retrieval section

#### Scenario: Scope is explicit

- **WHEN** the list is attached
- **THEN** it states that it covers the current session only, so it is not mistaken for the cross-session guidance

#### Scenario: Paths survive successive compactions

- **WHEN** a session compacts more than once
- **THEN** paths recovered from the previous summary are merged with the newly written archive, deduplicated, and ordered oldest → newest

#### Scenario: No archives

- **WHEN** a summary is produced and no archive exists
- **THEN** no list section is attached

### Requirement: Summary round-trips do not accumulate stale list sections

The system SHALL strip any archive-list section from summary text before it is handed to the summarizer or re-attached, so the list is always the runtime-computed one.

#### Scenario: Prior list is replaced

- **WHEN** a summary that already contains an archive list is summarized again
- **THEN** the existing list is removed before the new one is attached, leaving exactly one such section

