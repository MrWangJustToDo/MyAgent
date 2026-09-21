## MODIFIED Requirements

### Requirement: Parsed paths name real files

The diff view SHALL derive its paths from a parse that yields the real path of each changed file. A path whose bytes do not name a file SHALL NOT enter the row set, regardless of which git command produced it.

Git escapes paths it considers special when asked for line-oriented output — spaces and quotes are quoted, and non-ASCII bytes are octal-escaped by default. A parse that takes such a record literally produces a path that does not exist, so the view SHALL NOT rely on line-oriented output for path extraction.

This applies to **every** command whose output is parsed for paths, not only the commands the diff view itself issues. A path-extracting consumer added later, in this view or another, is covered by the same rule; the survey that established the current set is part of this requirement rather than an assumption behind it.

#### Scenario: A path containing a space

- **WHEN** a changed file's path contains a space
- **THEN** its row carries the real path, with no added quote characters

#### Scenario: A path containing a quote character

- **WHEN** a changed file's path contains a quote
- **THEN** the row carries the real path, and no intermediate directory is invented from the escaped text

#### Scenario: A path with non-ASCII characters

- **WHEN** a changed file's path contains non-ASCII characters
- **THEN** the row carries the real path rather than its octal-escaped form

#### Scenario: A rename

- **WHEN** a file is renamed
- **THEN** both the old and the new path are indexed, and neither is derived by splitting the record on a separator that can also occur inside a path

#### Scenario: A path that names a directory is rejected

- **WHEN** a record names a directory rather than a file
- **THEN** it produces no row, and no row is produced whose name is empty

#### Scenario: A later consumer in another view is covered

- **WHEN** a consumer outside this view extracts a path from git output
- **THEN** it reads that output NUL-delimited for the same reason
- **AND** the requirement is not read as binding only the commands listed above
