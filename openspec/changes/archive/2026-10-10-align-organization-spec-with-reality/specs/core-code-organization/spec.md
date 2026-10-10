## RENAMED Requirements

- FROM: `### Requirement: Domain utility directories expose barrels`
- TO: `### Requirement: Barrel policy follows consumers, not a directory list`

## MODIFIED Requirements

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

## ADDED Requirements

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
