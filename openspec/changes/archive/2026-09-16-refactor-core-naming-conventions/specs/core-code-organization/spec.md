# core-code-organization Spec

## ADDED Requirements

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

### Requirement: Domain utility directories expose barrels

Each domain utility directory SHALL provide an `index.ts` barrel. The directories in scope
are `src/utils/`, `src/agent/approval/`, `src/agent/media/`, `src/agent/run-helpers/`, and
`src/managers/stream-recovery/`. The top-level
`src/agent/` namespace intentionally remains barrel-free; cross-domain imports use direct
module paths there.

#### Scenario: Importing a run-helper

- **WHEN** a manager imports `assertAsyncIterable` and other run helpers
- **THEN** the import resolves via `../run-helpers/index.js` rather than individual deep paths per symbol cluster

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
