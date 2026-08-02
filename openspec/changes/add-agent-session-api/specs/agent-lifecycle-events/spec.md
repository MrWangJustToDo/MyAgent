## ADDED Requirements

### Requirement: Hosts use Agent Session for UI observation
UI hosts (including `@my-agent/app`) SHALL use AgentSession subscription channels for status, messages, usage, todos, plan, queues, and streaming updates. There is no host-facing `ManagedAgent.observe()` facade; domain Emitters and AgentEventBus remain package-internal (plus curated advanced bus access where documented).

#### Scenario: Standard chat UI uses session subscribe
- **WHEN** the app chat shell initializes observation after AgentSession migration
- **THEN** it registers `session.subscribe` (or a store backed by it) for UI updates instead of direct ManagedAgent field readers for those same concerns

### Requirement: Lifecycle bus emission contracts remain
AgentEventBus emission rules for tool lifecycle, compaction kind, session restore, subagent destroy, approval Event→Log exclusivity, and subagent completed summary remain in force. AgentSession `lifecycle` channel is a filtered projection for hosts and MUST NOT replace or suppress those bus emissions for other consumers (such as Event→Log).

#### Scenario: Event→Log still receives approval events
- **WHEN** tools need approval and session hosts listen on the `state`/`lifecycle` channels
- **THEN** `agent:tool-approval-request` is still emitted on the AgentEventBus for Event→Log bridging
