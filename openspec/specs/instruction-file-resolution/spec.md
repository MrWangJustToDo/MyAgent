# instruction-file-resolution Specification

## Purpose

Define which project instruction file (`CLAUDE.md` / `AGENTS.md`) is loaded into `<project_instructions>`, and how `@path` references inside it are resolved, expanded, bounded, and reported.

A project commonly splits its guidance across files — the idiomatic layout keeps a thin `CLAUDE.md` pointing at a larger `AGENTS.md`. This capability makes that composition real: the referencing file's instructions are only as good as what they expand to, so expansion, its bounds, and its failure reporting are specified together. It also fixes the single-owner requirement for discovery, because the loader (system prompt) and the turn-context change detector (re-injection) must agree on what was loaded and what changed.
## Requirements
### Requirement: Instruction file selection is first-found-wins

The system SHALL load exactly one instruction file, being the first existing file in the configured filename order (`CLAUDE.md`, then `AGENTS.md`), with no implicit fallback to a later candidate.

#### Scenario: CLAUDE.md present alongside AGENTS.md

- **WHEN** both `CLAUDE.md` and `AGENTS.md` exist in the workspace root
- **THEN** only `CLAUDE.md` is loaded, and `AGENTS.md` is loaded only if `CLAUDE.md` references it

#### Scenario: CLAUDE.md absent

- **WHEN** `AGENTS.md` exists and `CLAUDE.md` does not
- **THEN** `AGENTS.md` is loaded

### Requirement: `@path` references are expanded at load time

The system SHALL replace an `@`-prefixed file reference with the referenced file's contents, recursively, so a file that composes guidance from other files loads as if written in one file.

#### Scenario: A pointer file inlines its target

- **WHEN** `CLAUDE.md` contains `@AGENTS.md` and `AGENTS.md` exists
- **THEN** the loaded content contains `AGENTS.md`'s text in place of the reference, and the reference no longer appears literally

#### Scenario: Inlined regions are delimited

- **WHEN** a reference is expanded
- **THEN** the inlined text is wrapped in import markers naming the source file, so the boundary is visible in the prompt

#### Scenario: A token without a file extension is not a reference

- **WHEN** the text contains an npm-scoped name such as `@codent/core` or `@tanstack/ai`
- **THEN** it is left as written and no notice is recorded

#### Scenario: References inside code regions are not expanded

- **WHEN** a reference appears inside a fenced code block or an inline code span
- **THEN** it is left as written

### Requirement: Reference resolution is relative to the referencing file

A relative reference SHALL resolve against the directory of the file that contains it. A reference beginning with `/` SHALL resolve against the workspace root.

#### Scenario: Root-relative reference

- **WHEN** an instruction file at any depth contains `@/openspec/AGENTS.md` and the workspace root contains `openspec/AGENTS.md`
- **THEN** that file is inlined, and the reference is not treated as an escape from the workspace

#### Scenario: Sibling reference

- **WHEN** a file in a subdirectory references `@NOTES.md` and a sibling `NOTES.md` exists
- **THEN** the sibling is inlined

### Requirement: Expansion is bounded and recursive references are cut

The system SHALL bound expansion by a maximum nesting depth and a total byte budget, and SHALL detect references that would re-expand a file already on the current import chain.

#### Scenario: Circular reference

- **WHEN** `a.md` references `b.md` and `b.md` references `a.md`
- **THEN** each file is inlined at most once on that chain, the closing reference is left as written, and a notice records the circular reference

#### Scenario: Repeated reference in sibling branches

- **WHEN** two different branches both reference the same file
- **THEN** the file is inlined in both branches, because cycle detection is per chain rather than global

#### Scenario: Depth bound

- **WHEN** a reference chain is deeper than the maximum import depth
- **THEN** expansion stops at the bound and a notice records why

#### Scenario: Byte budget bound

- **WHEN** inlined content exhausts the instruction byte budget
- **THEN** further references are not inlined and a notice records that the budget was exhausted

### Requirement: References outside the workspace are refused

The system SHALL NOT inline a reference that resolves outside the workspace root, nor one that resolves to a directory.

#### Scenario: Parent-directory escape

- **WHEN** a reference resolves to a path outside the workspace root by way of `../`
- **THEN** nothing is inlined, the reference is left as written, and a notice records that it is outside the workspace root

#### Scenario: Directory reference

- **WHEN** a reference resolves to an existing directory
- **THEN** nothing is inlined and a notice records that the target is a directory

### Requirement: No reference failure is silent

The system SHALL record a diagnostic for every reference that is not expanded, and SHALL surface those diagnostics to both the operator and the model.

#### Scenario: Missing target

- **WHEN** a reference names a file that does not exist
- **THEN** the reference is left as written and a notice records that the file was not found

#### Scenario: Diagnostics are surfaced

- **WHEN** the instruction file loads with unresolved references
- **THEN** the notices are logged during session bootstrap, and are included in the `<instruction_context>` section when the instruction content is re-injected

### Requirement: Instruction content is bounded by a byte budget

The system SHALL bound the loaded instruction content by a maximum size counted in **bytes**, SHALL cut at a line boundary, and SHALL report when truncation occurred.

#### Scenario: Multi-byte content respects the budget

- **WHEN** the instruction content contains multi-byte characters and exceeds the budget
- **THEN** the loaded content's UTF-8 byte length is within the budget

#### Scenario: Truncation is reported

- **WHEN** the content is truncated to fit the budget
- **THEN** the re-injected instruction section states that the file was truncated and names the budget

### Requirement: Discovery and expansion have a single owner

The system SHALL resolve instruction content through one shared implementation, used by both the system-prompt loader and the turn-context change detector, so the two cannot disagree about which file was loaded or what it expanded to.

#### Scenario: Change to an imported file is detected

- **WHEN** a file is loaded by way of an `@` reference and is then edited
- **THEN** the change is detected as an instruction change and the latest expanded content is re-injected, because the change digest covers the expanded text rather than the referencing file's raw bytes

#### Scenario: Expansion diagnostics affect change detection

- **WHEN** an unresolved reference appears or disappears
- **THEN** that is detected as an instruction change, because the recorded diagnostics are part of what is compared

