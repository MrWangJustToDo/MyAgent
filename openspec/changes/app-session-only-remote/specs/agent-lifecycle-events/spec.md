## MODIFIED Requirements

### Requirement: Subagent completed payload includes summary

When a subagent run finishes successfully, the system SHALL emit `subagent:completed` with a typed `payload.summary` field (string) suitable for Event→Log formatting. Event→Log SHALL prefer `event.payload.summary` when composing the log message.

#### Scenario: Completed event includes summary for logging
- **WHEN** a subagent finishes successfully and emits `subagent:completed`
- **THEN** the event envelope includes `payload.summary` as a string and Event→Log uses that field for the log line

## ADDED Requirements

### Requirement: Lifecycle events use typed envelope
AgentEventBus emissions covered by this spec (tool lifecycle, compaction kind, session restore, subagent destroy/completed, approval requests) SHALL use the shared typed AgentEvent envelope (`ts`, `agentId`, `parentId?`, `payload`) instead of loosely typed `data` bags. Existing emission timing and exclusivity contracts remain in force.

#### Scenario: Approval request uses payload envelope
- **WHEN** tools need approval and `agent:tool-approval-request` is emitted
- **THEN** the event includes typed `payload` fields required by Event→Log
- **AND** the status controller still does not call `log.approval` directly
