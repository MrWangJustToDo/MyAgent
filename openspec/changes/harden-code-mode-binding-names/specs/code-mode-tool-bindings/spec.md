## ADDED Requirements

### Requirement: Code-mode binding names SHALL be legal identifiers

Every tool exposed to a code-mode script SHALL have a binding name that is a legal JavaScript identifier (`[A-Za-z_$][A-Za-z0-9_$]*`). Normalisation SHALL happen on our side before the tool list reaches `createCodeMode`, because upstream derives the binding name from the tool name verbatim.

#### Scenario: Hyphen becomes underscore
- **WHEN** a tool named `mcp__myserver_read-file` is exposed to code mode
- **THEN** its binding name is `mcp__myserver_read_file` and the generated type stub declares a legal identifier

#### Scenario: Any illegal character is normalised
- **WHEN** a tool name contains a character outside `[A-Za-z0-9_]` (dot, space, colon, …)
- **THEN** each such character is replaced with `_` in the binding name

#### Scenario: Legal names are untouched
- **WHEN** a tool name already consists only of legal identifier characters
- **THEN** its binding name is byte-identical to the tool name, and the emitted system prompt is unchanged from before this change

### Requirement: Normalised-name collisions SHALL be disambiguated

Two tools whose names differ only in characters that normalise to `_` SHALL remain individually callable. The system SHALL NOT let one silently shadow the other.

#### Scenario: Hyphen/underscore pair stays distinct
- **WHEN** `read-file` and `read_file` are both exposed to code mode
- **THEN** each gets a distinct binding name and a script can call either one

#### Scenario: Disambiguation is deterministic
- **WHEN** the same tool set is exposed twice (for example across restarts)
- **THEN** each tool receives the same binding name both times, so a script written against one run works on the next

#### Scenario: Disambiguation does not depend on input order
- **WHEN** the same set of colliding tools is exposed in a different order (MCP tools arrive as servers connect)
- **THEN** each tool still receives the same binding name

#### Scenario: Unresolvable collision is dropped, not emitted
- **WHEN** the **same** tool name is offered twice, which no suffix can separate from itself
- **THEN** the duplicate is dropped from code mode with a warning naming the tool, rather than emitting a prompt containing a duplicate identifier

### Requirement: The model-visible name SHALL match the callable identifier

A script SHALL be able to call any binding the prompt advertises. Where normalisation renames a binding, every surface that names it — the type stub, the Available External APIs list, and the discoverable-API catalog used by `discover_tools` — SHALL use the normalised name.

#### Scenario: Discovered tool is callable by the advertised name
- **WHEN** a lazy tool named `web-search` is discovered through `discover_tools`
- **THEN** the stub it returns names `external_web_search`, and a script calling `tools.external_web_search` resolves to that tool

#### Scenario: No surface advertises an unnormalised name
- **WHEN** any tool has been renamed for code mode
- **THEN** no prompt section or discovery payload contains the pre-normalisation name as a binding

### Requirement: Normalisation SHALL be idempotent

Re-normalising an already-normalised name SHALL produce the same name, so the step stays correct if upstream later normalises as well.

#### Scenario: Second pass is a no-op
- **WHEN** an already-normalised name passes through the normalisation step again
- **THEN** the result equals the input
