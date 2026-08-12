## ADDED Requirements

### Requirement: Domain modules must not import managers
Domain modules under `packages/core/src/agent/` SHALL NOT import from `packages/core/src/managers/` once the layering wave is complete. Shared types and helpers needed by both layers MUST live in a neutral module (for example `runtime-types/` or an agreed shared folder).

#### Scenario: No agent-to-managers imports remain
- **WHEN** the layering tasks are marked complete
- **THEN** a repository search of `agent/**` import paths MUST find zero imports of `managers/`

#### Scenario: Shared TokenUsage lives outside managers for domain use
- **WHEN** agent-domain code needs token usage typing
- **THEN** it MUST import that type from the neutral shared module, not from `managers/usage-tracker-utils`

### Requirement: Package-wide stream helpers leave subagent
Stream helpers used by main chat, UI channel, and recovery (including run-error throwing and assistant-text / task-summary extraction) MUST NOT live under `agent/subagent/` as their primary home; they MUST be placed under a package-wide location such as `agent/stream/` or `agent/utils/`.

#### Scenario: Chat controller imports stream helpers from non-subagent path
- **WHEN** `AgentChatController` or `AgentUIChannel` imports run-error or assistant-text helpers
- **THEN** the import path MUST NOT resolve primarily through `agent/subagent/`

### Requirement: Stream recovery is named and split by strategy
Stream recovery orchestration MUST be named to reflect general recovery (not only reactive compact) and MUST separate reactive-compact, capability sanitization, and max-tokens continuation into distinct modules composed by the orchestrator.

#### Scenario: Reactive-compact-only filename is removed
- **WHEN** the recovery rename wave is complete
- **THEN** the former `reactive-compact-retry` module name MUST NOT remain as the primary implementation file (no required long-lived shim)

### Requirement: Models must not depend on managers
The `models/` layer MUST NOT import `managers/` modules. Prompt-cache boundary constants and cache-key helpers used on the wire MUST be owned by models or an agent prompt module that does not create a models→managers edge.

#### Scenario: prompt-cache has no managers import
- **WHEN** the prompt/cache boundary tasks are complete
- **THEN** `models/prompt-cache` (and related model modules) MUST have zero imports from `managers/`

### Requirement: AgentManager file name matches export
The file that exports `AgentManager` MUST be named `agent-manager.ts` (not `manager-agent.ts`). The `ManagedAgent` implementation file MAY remain `managed-agent.ts`.

#### Scenario: Import path uses agent-manager
- **WHEN** code imports `AgentManager` from the managers package area
- **THEN** the canonical source file path MUST be `managers/agent-manager.ts`

### Requirement: Plan placement convention is documented
The project MUST document that plan domain logic lives under `agent/plan/` while plan tool factories remain under `agent/tools/` unless a later change explicitly relocates them.

#### Scenario: Architecture docs state the convention
- **WHEN** documentation is updated for this change
- **THEN** `ARCHITECTURE.md` or equivalent MUST state the plan domain vs tools placement rule
