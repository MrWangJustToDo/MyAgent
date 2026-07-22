## ADDED Requirements

### Requirement: Hosts use observe for per-agent UI wiring

Host application code that needs agent status, lifecycle telemetry, and/or tool streaming for a single managed agent SHALL use `ManagedAgent.observe()`. Per-agent `subscribeState` and public streaming subscribe APIs MUST NOT be part of the published `@my-agent/core` host surface.

#### Scenario: Recommended path documented
- **WHEN** a reader follows `packages/core/ARCHITECTURE.md` observation guidance
- **THEN** the docs present `observe()` as the host path for L1–L3 and map handlers to those layers

#### Scenario: Raw bus subscribe still allowed for cross-agent telemetry
- **WHEN** a host registers `agentManager.on("*", …)` for process-wide telemetry
- **THEN** that registration continues to work independently of any `observe()` calls
