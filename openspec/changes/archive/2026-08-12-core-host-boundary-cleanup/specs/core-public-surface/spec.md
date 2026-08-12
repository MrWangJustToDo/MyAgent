## ADDED Requirements

### Requirement: Public entry is Session-safe plus host bootstrap
The published `@my-agent/core` entry (`src/index.ts`) SHALL export Session/Host APIs, serializable types, CoreEnv/ModelProvider registries, and the minimal host-bootstrap symbols needed to create a Local Session. It MUST NOT export live runtime control classes intended only for in-process ManagedAgent wiring when those are replaceable by Session.

#### Scenario: Forbidden runtime classes off public entry
- **WHEN** a consumer imports from `@my-agent/core`
- **THEN** `AgentLog` and `TodoManager` **classes** SHALL NOT be exported from the public entry
- **AND** serializable types such as `LogEntry` / `TodoItem` MAY remain exported

#### Scenario: Compaction executors off public entry
- **WHEN** a consumer needs to run compaction
- **THEN** they SHALL use Session `dispatch({ type: "compact" })` (or host-internal APIs)
- **AND** `autoCompact` / `applyCompactionResult` SHALL NOT be exported from the public entry

### Requirement: Internal exports via dev entry
Symbols required only by package validates or internal tests SHALL be exported from `src/dev.ts` / `dist/dev.mjs`, not from the public package export map used by hosts/UI.

#### Scenario: Validate scripts
- **WHEN** a `validate:*` script needs `TodoManager` or compaction helpers
- **THEN** it SHALL import from `dist/dev.mjs`
- **AND** the public `dist/index.mjs` SHALL omit those symbols

### Requirement: Export allowlist validation
The repository SHALL include an automated check that fails when forbidden symbols reappear on the public core entry.

#### Scenario: Gate fails on regression
- **WHEN** `AgentLog` (class) is re-added to `src/index.ts`
- **THEN** the allowlist validate script SHALL fail
