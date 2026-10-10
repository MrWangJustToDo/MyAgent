# core-code-organization Specification

## Purpose

How `@codent/core` is organised: module ownership and directory layout, the naming conventions a module must follow, and the import boundaries that keep subsystems independent.
## Requirements
### Requirement: Built-in extensions expose one canonical factory

Each built-in extension (Skills, Memory, LSP) SHALL be defined in `<domain>/extension.ts`
inside its own domain directory and SHALL export exactly one factory named
`createXxxExtension` (e.g. `createSkillsExtension`, `createMemoryExtension`,
`createLspExtension`). Built-in extension modules SHALL NOT export bare-name factory
aliases or default exports.

#### Scenario: Consuming a built-in extension

- **WHEN** `agent-factory.ts` or any host wires the Skills, Memory, or LSP extension
- **THEN** it imports `createXxxExtension` from the domain's `extension.ts` module with no alias or default-export fallback available

#### Scenario: Auditing for stray exports

- **WHEN** a reviewer searches core's `agent/` tree for `export default` in extension modules
- **THEN** no extension module matches

### Requirement: ManagedAgent has no underscore-prefixed members

Private fields of `ManagedAgent` (including its partial-class files) SHALL NOT use an
underscore prefix. Backing fields of same-named accessors SHALL use descriptive names
(e.g. `currentStatus`, `uiChannel`, `chatController`). The `SkillRegistry` accessor
misnomer SHALL be fixed to `getSkillRegistry` / `setSkillRegistry`.

#### Scenario: Getter backing field

- **WHEN** the `get status()` accessor reads its backing storage
- **THEN** the storage is a descriptively named private field (`currentStatus`), not `_status`

#### Scenario: Accessor misnomer

- **WHEN** code accesses the agent's skill registry through ManagedAgent accessors
- **THEN** the accessors are named `getSkillRegistry` / `setSkillRegistry`

### Requirement: Module file names describe their content

Module file names inside domain directories SHALL state their responsibility rather than
using generic placeholders (`output.ts`, `prompt.ts`, `tools.ts`, `helpers.ts` for
non-trivial modules). Shared helpers within a tool directory SHALL be disambiguated from
the domain-level `shared/` directory by name.

#### Scenario: Locating subagent modules

- **WHEN** a developer looks for the explore system prompt or the read-only tool set under `agent/subagent/`
- **THEN** the files are named `explore-prompt.ts` and `subagent-tools.ts` respectively

### Requirement: Internal renames land without compatibility shims

Internal renames SHALL land as the new shape directly: call sites MUST switch within the
same change, covering module paths, file names, and export identifiers. The codebase SHALL
NOT retain old-path re-exports, deprecated aliases, or staged dual exports for internal
renames.

#### Scenario: Deleting an extension alias

- **WHEN** the `skillsExtension` / `memoryExtension` / `lspExtension` aliases are removed in favor of `createXxxExtension`
- **THEN** no re-export bridge or deprecated alias remains anywhere in the workspace

### Requirement: Source files respect the 400-line guideline

Core source files SHALL stay within the workspace's 400-line guideline (`.cursor/rules/040`)
where a cohesive responsibility boundary exists. Files that legitimately exceed it (e.g.
`managed-agent.ts` as composition root) SHALL document the trade-off rather than being cut
arbitrarily.

#### Scenario: Oversized validation entry

- **WHEN** `src/dev.ts` grows past 400 lines of re-exports
- **THEN** it is split into domain-scoped parts under the limit with `dev.ts` as the aggregating entry

### Requirement: Naming conventions are documented and docs match reality

AGENTS.md SHALL contain a Core Naming Conventions section covering file naming, extension
factory exports, member/accessor rules (no underscore-prefixed members; getter vs `getXxx()`
guidance), and barrel expectations. The AGENTS.md core file-structure map SHALL match the
actual `packages/core/src` layout.

#### Scenario: Structure audit

- **WHEN** the documented file-structure map is compared against `ls packages/core/src`
- **THEN** every listed path exists exactly once and every current top-level directory appears

### Requirement: Barrel policy follows consumers, not a directory list

A domain directory SHALL expose an `index.ts` barrel when, and only when, it is consumed as a unit
— that is, when some module imports the directory itself (`"./foo"`, `"../foo"`) rather than a deep
path inside it. A barrel whose directory no other module imports is prohibited: it reads as a public
API while being unreachable in fact, so its exports drift untyped against any caller.

The top-level `src/agent/` namespace SHALL remain barrel-free, and cross-domain imports within it
SHALL use direct module paths. This is the rationale for the rule above, not an exception to it: the
`agent/` domains are not consumed as units, so a barrel there would be the prohibited shape.

There SHALL be no fixed list of directories required to carry a barrel. Whether a directory is
consumed as a unit is a property of the current call graph, evaluated against the tree — not a roster
that a refactor can silently invalidate.

#### Scenario: A consumed directory carries a barrel

- **WHEN** a manager imports several symbols from a domain directory as `"../agent/compaction"`
- **THEN** that directory exposes an `index.ts`, and consumers reach the symbols through it

#### Scenario: A barrel with no consumer is dead weight

- **WHEN** a directory exposes `index.ts` but every import of its files names a deep path instead
- **THEN** the barrel is not consumed and SHALL be deleted rather than kept as a nominal surface

#### Scenario: The agent namespace stays barrel-free

- **WHEN** a module under `agent/` needs a symbol from another `agent/` domain
- **THEN** it imports the defining module directly, and no `agent/<domain>/index.ts` is added to satisfy the import

### Requirement: Repository paths named in documentation resolve

Documentation SHALL NOT name a repository path that does not resolve to an existing file or
directory. This covers the project documentation files (`AGENTS.md`, `CLAUDE.md`) and the main specs
under `openspec/specs/`. When a module is relocated or deleted, any documentation naming its former
location SHALL be corrected in the same change; a path SHALL NOT be left pointing at a location that
was renamed away, unless it is explicitly marked as planned, illustrative, or outside this repository.

Paths that name no location in this repository (a word, a package name, an upstream URL) are out of
scope, as are globs and paths whose target is stated as planned.

#### Scenario: A documented path resolves

- **WHEN** `AGENTS.md` names `packages/core/src/models/types.ts` as the capability source of truth
- **THEN** that file exists at that path

#### Scenario: A moved file leaves a stale reference

- **WHEN** a module is relocated and a documentation file or main spec still names its old path
- **THEN** the gate fails, naming the document and the unresolved path

#### Scenario: A spec names a deleted directory

- **WHEN** a requirement lists a directory that no longer exists and is not marked as planned
- **THEN** the gate fails, and the requirement is corrected rather than the directory recreated

