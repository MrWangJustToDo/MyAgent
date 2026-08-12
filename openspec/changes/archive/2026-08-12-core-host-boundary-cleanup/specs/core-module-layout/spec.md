## ADDED Requirements

### Requirement: Disk persistence directory is distinct from Host Session API
On-disk session persistence modules SHALL live under a path that does not collide with the Host-facing `agent-session/` API (e.g. `agent/persistence/`).

#### Scenario: Import clarity
- **WHEN** a developer imports disk SessionStore vs AgentSession Host types
- **THEN** the module paths SHALL make the plane obvious (`persistence` vs `agent-session`)
- **AND** no shim path under the old `agent/session/` location SHALL remain

### Requirement: Cross-cutting utils live under src/utils
Shared non-domain helpers used across managers and agent domains (at minimum id generation and Emitter) SHALL live under `packages/core/src/utils/`.

#### Scenario: generateId location
- **WHEN** code needs `generateId`
- **THEN** it SHALL import from the `src/utils` home
- **AND** `agent/utils.ts` SHALL NOT remain as a catch-all export file

### Requirement: Domain helpers stay with domains
Helpers tightly coupled to a domain (compaction, tool-phase, capability sanitize, etc.) SHOULD remain beside that domain rather than a global utils dump. Leftover `agent/utils/*` files MUST be either relocated to a clear owner or documented as transitional with an owner path.

#### Scenario: No new dump files
- **WHEN** new helper modules are added
- **THEN** they MUST NOT be added to a revived top-level catch-all `agent/utils.ts`
