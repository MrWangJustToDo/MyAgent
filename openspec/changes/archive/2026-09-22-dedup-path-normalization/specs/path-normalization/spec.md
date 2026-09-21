## ADDED Requirements

### Requirement: The POSIX path rule has one definition

A path whose separators are backslashes SHALL be converted to the forward-slash form used for
keys and display by one definition, and code that needs the conversion SHALL call it rather
than spelling the substitution out.

The rule is `\` → `/`. A caller that additionally needs trailing separators removed calls a
second exported form that is composed from the first, so the substitution itself has one
origin even where the composed behaviour is needed.

#### Scenario: A second caller does not re-spell the rule

- **WHEN** a module needs forward-slash paths, or forward-slash paths without a trailing separator
- **THEN** it calls the shared definition
- **AND** it does not contain the substitution itself

#### Scenario: Normalising is not resolving

- **WHEN** a caller converts separators
- **THEN** only the separators change
- **AND** the caller does not gain or lose `..` resolution, root stripping, or absolute-path handling that it did not already do

#### Scenario: Callers keep their own semantics

- **WHEN** different callers need different follow-up treatment — a pure display value, a comparison key, a workspace-relative path
- **THEN** each keeps its own follow-up step
- **AND** sharing the rule does not force them through a common sequence of further transformations

### Requirement: Git output is never parsed line-oriented for paths

Every consumer that extracts a path from git output SHALL request NUL-delimited output. Git
quotes paths it considers special in line-oriented output — spaces and quotes are quoted, and
non-ASCII bytes are octal-escaped by default — so a path taken from such output is not the
file's path.

Which commands have path-extracting consumers SHALL be established by survey, so the
requirement covers the set rather than the consumers noticed first.

#### Scenario: A file with non-ASCII characters is findable

- **WHEN** a file whose name contains non-ASCII characters is offered to the workspace file picker
- **THEN** the path it is offered under is the file's real path
- **AND** a query using the file's own characters matches it

#### Scenario: A path containing a quote does not invent a directory

- **WHEN** a file's path contains a quote character
- **THEN** the path offered to the picker is the real path
- **AND** no intermediate directory is produced from the escaped text

#### Scenario: A file whose path was previously unusable is now openable

- **WHEN** the picker lists a file whose path a line-oriented parse corrupted
- **THEN** the file can be opened from the picker, because the path names it

#### Scenario: Consumers that only test for change do not convert

- **WHEN** a git command's output is used only to decide whether the tree is dirty, or is embedded as opaque text
- **THEN** that consumer does not extract a path
- **AND** it is not converted to NUL-delimited output

### Requirement: Inline path normalization fails a check

A check SHALL fail when a source module spells the separator substitution out instead of
calling the shared definition, so the number of sites cannot grow back by copying a
neighbour.

#### Scenario: A new inline substitution is rejected

- **WHEN** a module contains the substitution
- **THEN** the check fails and names the module

#### Scenario: The definition itself is allowed

- **WHEN** the check runs against the module defining the rule
- **THEN** that module passes
