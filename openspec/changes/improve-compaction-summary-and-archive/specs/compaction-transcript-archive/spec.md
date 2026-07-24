## ADDED Requirements

### Requirement: Persist compact transcript archive
The system SHALL, after a successful compaction that produces a summary, write a plain-text archive of the conversation segment that was compressed so agents can recover details via filesystem tools.

#### Scenario: Archive written on successful compact
- **WHEN** auto, manual, or reactive compaction successfully generates a summary and a non-empty compressed segment exists
- **THEN** the system writes a markdown/plain-text transcript file under a session-scoped path within `.agents/transcripts/`

#### Scenario: Archive write failure is non-fatal
- **WHEN** archive persistence fails (I/O error or missing env)
- **THEN** compaction still applies the summary and kept messages; the run does not fail solely due to archive write failure

#### Scenario: Greppable format
- **WHEN** an archive file is written
- **THEN** its body is a serialized conversation transcript suitable for text search (not a raw dump of opaque tool JSON blobs as the primary format)

### Requirement: Summary points at archive
The system SHALL include the archive location in the compaction summary when an archive was written successfully.

#### Scenario: Pointer section present
- **WHEN** compaction completes and an archive file was written
- **THEN** the summary text includes a short archive section with a workspace-relative path and guidance to search with grep (or small offset/limit reads) for missing details, without reading the whole archive

#### Scenario: No pointer without archive
- **WHEN** archive was not written
- **THEN** the summary does not claim an archive path exists

### Requirement: Archive path isolation
The system SHALL isolate archives by session identity and avoid committing them as project source by default.

#### Scenario: Session-scoped directory
- **WHEN** archives are written for a session
- **THEN** files are placed under a directory that includes the session id (or agent id fallback)

#### Scenario: Gitignore
- **WHEN** the repository ignore rules are configured for this feature
- **THEN** `.agents/transcripts/` (or the chosen archive root) is ignored by git
