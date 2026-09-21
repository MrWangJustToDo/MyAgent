# workspace-diff-view Specification

## Purpose

The terminal diff view backing the workspace panel: how it lists changed files, derives their paths,
and keeps rows, per-file diffs and line counts consistent.

## Requirements

### Requirement: Every changed file appears as a row

The workspace diff view SHALL list every file with uncommitted changes, including files inside directories that git has not yet tracked. For an untracked directory, the view SHALL list the files it contains rather than the directory itself.

#### Scenario: A newly created change directory is fully visible

- **WHEN** `openspec/changes/<name>/proposal.md`, `tasks.md` and a delta spec exist and none of them has ever been committed
- **THEN** each of those files appears as its own row in the diff view

#### Scenario: Nested untracked files are listed individually

- **WHEN** an untracked directory contains files at more than one depth
- **THEN** every file appears as its own row, at its own depth

#### Scenario: Tracked changes are unaffected

- **WHEN** a modified file, a deleted file and a staged rename exist alongside untracked files
- **THEN** all of them are listed, and each existing row is unchanged from before this fix

### Requirement: Parsed paths name real files

The diff view SHALL derive its paths from a parse that yields the real path of each changed file. A path whose bytes do not name a file SHALL NOT enter the row set, regardless of which git command produced it.

Git escapes paths it considers special when asked for line-oriented output — spaces and quotes are quoted, and non-ASCII bytes are octal-escaped by default. A parse that takes such a record literally produces a path that does not exist, so the view SHALL NOT rely on line-oriented output for path extraction.

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

### Requirement: Every registered path is one the view can read

A path that appears as a row SHALL be usable to read that file's content. The row set, the per-file diff lookup and the per-file line counts SHALL be derived from the same parsed paths, so a row and its statistics cannot disagree about which file they describe.

#### Scenario: An untracked file shows an added count

- **WHEN** an untracked file with content appears in the diff view
- **THEN** its row shows a non-zero added line count

#### Scenario: A special-character path still shows its count

- **WHEN** a changed file whose path contains a space, a quote, or non-ASCII characters appears in the diff view
- **THEN** its row shows the added/deleted counts git reported for that file, rather than no counts

#### Scenario: Statistics and rows agree on the key

- **WHEN** line counts are merged into the row set
- **THEN** a stat computed for a file matches that file's row, so no row silently loses its counts

### Requirement: Diff-view path handling is covered by tests

The path rules above SHALL be covered by automated tests, because each defect they replace was silent — a wrong path renders a row that looks plausible, and no test failed.

#### Scenario: The parse and tree rules are covered

- **WHEN** the test suite runs
- **THEN** it asserts that a directory-shaped record yields no file row, that an untracked directory's files each yield a row, and that quoted and non-ASCII paths survive the parse as real paths

#### Scenario: Coverage is derived from git's own output

- **WHEN** the path-handling tests are written
- **THEN** their inputs are taken from git's actual output for such paths, so the tests pin the real escape behaviour rather than a copy of it
