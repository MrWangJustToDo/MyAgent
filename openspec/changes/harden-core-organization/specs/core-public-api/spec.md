## ADDED Requirements

### Requirement: Public package entry stays curated
The `@my-agent/core` package entry (`src/index.ts`) MUST export only APIs intended for hosts and adapters. Helpers used solely by core internals or `validate:*` scripts MUST live on `dev.ts` (or remain unexported), not on the public entry.

#### Scenario: Session-sync internals are not public
- **WHEN** the public-API trim wave is complete
- **THEN** session-sync tracker helpers that are only consumed inside core / validates MUST NOT be exported from `@my-agent/core` public entry

#### Scenario: Validates still can import internals via dev
- **WHEN** a validate script needs a trimmed helper
- **THEN** it MUST import that helper from `dist/dev.mjs` / `dev.ts` rather than the public package entry

### Requirement: ManagedAgent wiring fields are not host-writable
After the encapsulation wave, host-facing code MUST NOT be able to assign internal wiring fields such as `runner`, `textAdapter`, and `runnerConfigKey` on `ManagedAgent`. Package-internal code MAY mutate them through controlled accessors or same-module logic.

#### Scenario: Type surface blocks host assignment of runner
- **WHEN** a TypeScript host imports `ManagedAgent` from `@my-agent/core`
- **THEN** assigning `managed.runner` MUST be a type error (field private or otherwise non-assignable from outside the declaring class)

### Requirement: Observable ManagedAgent state is read-safe
Fields that hosts observe (for example UI channel, status controller, context, usage) MUST be exposed as read-only from outside `ManagedAgent` after the encapsulation wave, while remaining updatable by core orchestration.

#### Scenario: Hosts can read status but not replace the controller casually
- **WHEN** encapsulation for observable fields is applied
- **THEN** external replacement of core-owned controllers/channels MUST be prevented or limited to documented package-internal APIs

### Requirement: Breaking removals are documented
Any symbol removed from the public entry or any field privacy change MUST be listed in the change tasks or architecture notes so hosts can migrate without relying on shims.

#### Scenario: Removal list exists before release
- **WHEN** API trim and encapsulation tasks are marked done
- **THEN** the change documentation MUST include an explicit list of removed exports and tightened fields
