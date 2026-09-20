## ADDED Requirements

### Requirement: Search tools launch binaries without a shell

Search and lookup tools MUST invoke their external binary directly with an argument vector. They
MUST NOT construct shell command strings, and MUST NOT rely on shell syntax for correctness,
including but not limited to `set -o pipefail`, output redirection (`2>/dev/null` / `2>nul`),
pipelines (`| head -n`), or command chaining (`&&`, `;`).

The affected tools are `glob`, `grep`, `tree`, and skill discovery (`SKILL.md` lookup).

#### Scenario: Glob runs fd with an argument vector

- **WHEN** the `glob` tool searches for a pattern
- **THEN** it MUST spawn the binary with discrete arguments (pattern, path, type flag, excludes)
- **AND** it MUST NOT pass a command string to a shell
- **AND** the mode/type/exclude values MUST be delivered as separate arguments, not interpolated into one string

#### Scenario: Grep runs ripgrep with an argument vector

- **WHEN** the `grep` tool searches file contents
- **THEN** it MUST spawn `rg` with discrete arguments
- **AND** the search pattern MUST be passed as a single argument so patterns containing spaces, quotes, or shell metacharacters are not reinterpreted

#### Scenario: No bash-ism survives in tool bodies

- **WHEN** the tool layer is inspected for shell-only syntax
- **THEN** no tool MUST emit `set -o pipefail`, `2>/dev/null`, `| head -n`, or an equivalent construct
- **AND** this MUST be enforced by an automated check rather than by review alone

#### Scenario: Tree and skill lookup do not redirect stderr through a shell

- **WHEN** the `tree` tool runs or a skill directory is scanned for `SKILL.md`
- **THEN** the binary MUST be invoked with an argument vector
- **AND** stderr suppression MUST be achieved by the spawn options, not by a shell redirection

### Requirement: Output truncation happens in-process

Result truncation MUST be performed by the tool after capturing output, not by a shell pipeline.
The truncation boundary MUST remain the same as the current `head -n <fetchCount>` behaviour so
pagination results do not change.

#### Scenario: Truncation preserves pagination boundaries

- **WHEN** a search returns more entries than `offset + limit + 1`
- **THEN** the tool MUST truncate the captured output to that count before paginating
- **AND** the paginated page MUST be identical to the page the previous shell-based implementation produced

#### Scenario: Very large output is bounded

- **WHEN** a search produces output far exceeding the entry ceiling
- **THEN** the tool MUST stop accumulating at a byte ceiling
- **AND** it MUST surface the full result through the existing output-cache mechanism rather than inlining it

### Requirement: Binary availability is determined deterministically

The tool layer MUST determine whether a search binary is available before executing it, rather
than inferring availability from a Unix-only exit code. The `COMMAND_NOT_FOUND = 127` heuristic
MUST be replaced by a platform-aware check.

#### Scenario: Missing binary falls back on any platform

- **WHEN** the preferred binary is not installed
- **THEN** the tool MUST detect this before spawning
- **AND** it MUST fall back to the next candidate (or the portable alternative) on Windows as well as on POSIX hosts

#### Scenario: Fallback is not triggered by an empty successful search

- **WHEN** a search legitimately returns no matches
- **THEN** the tool MUST NOT treat that as a missing binary
- **AND** it MUST NOT re-run the search through the fallback path

### Requirement: Command existence probing is platform-neutral

`CoreEnv.commandExists` MUST NOT depend on a POSIX shell builtin. It MUST resolve the command
without executing a shell string.

#### Scenario: Probe works without a POSIX shell

- **WHEN** `commandExists` is called on a host whose shell is PowerShell or cmd.exe
- **THEN** it MUST return the correct boolean
- **AND** it MUST NOT evaluate `command -v`

#### Scenario: Windows executable extensions are honoured

- **WHEN** `commandExists` is called on Windows for a command provided as a `.cmd`, `.bat`, or `.exe` file
- **THEN** it MUST resolve against the platform executable extensions
- **AND** a command that exists only with an extension MUST be reported as available

#### Scenario: Project-local resolution still wins

- **WHEN** a command is installed locally in the project rather than on the global PATH
- **THEN** `commandExists` MUST report it as available, preserving the existing project-local resolution behaviour

### Requirement: External processes can be launched without a shell

`CoreEnv` MUST expose a way to execute a process with an explicit argument vector, so that tool
implementations do not have to construct shell strings.

#### Scenario: Argument vector execution is available

- **WHEN** a tool needs to run an external binary
- **THEN** it MUST be able to pass the executable and its arguments separately
- **AND** the invocation MUST NOT pass through a shell

#### Scenario: Hosts without the capability degrade rather than break

- **WHEN** a host does not implement argument-vector execution
- **THEN** the affected tools MUST fall back to an available execution path
- **AND** they MUST NOT fail outright, so a remote host on an older server keeps working

#### Scenario: Remote execution carries the same contract

- **WHEN** the environment is remote
- **THEN** argument-vector execution MUST be available over the same transport as the other command primitives
- **AND** the result MUST carry the same stdout/stderr/exit-code shape as a local invocation

### Requirement: Windows paths round-trip across tool boundaries

Path conversions owned by the tool layer MUST round-trip Windows drive paths without loss.
Separator and drive-letter handling MUST NOT assume a POSIX root.

#### Scenario: LSP file URIs round-trip a drive path

- **WHEN** a file URI of the form `file:///C:/dir/file.ts` is converted to a path
- **THEN** the result MUST be a valid Windows path with the drive letter intact
- **AND** converting that path back to a URI MUST reproduce the original URI
- **AND** the conversion MUST NOT yield a POSIX-looking path with a leading separator before the drive letter

#### Scenario: Workspace-relative paths do not assume a slash-terminated root

- **WHEN** a path inside the workspace is converted to a workspace-relative path
- **THEN** the computation MUST work for a root that does not end with `/`
- **AND** a path genuinely inside the workspace MUST NOT be returned as an absolute path

#### Scenario: Sandbox deny rules resolve the home directory per platform

- **WHEN** sandbox deny rules are built for paths under the user's home directory
- **THEN** the rules MUST be derived from the resolved home directory
- **AND** they MUST NOT be emitted as literal unresolved paths
