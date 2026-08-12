## ADDED Requirements

### Requirement: ManagedAgent provides observe facade

The system SHALL expose `ManagedAgent.observe(handlers)` that registers the requested L1/L2/L3 (and optional log) listeners and returns a single unsubscribe function that tears down all of them. Calling unsubscribe more than once MUST be safe (no-op after first).

#### Scenario: Single teardown removes state and event listeners
- **WHEN** a host calls `observe({ onState, onEvent })` and later invokes the returned unsubscribe
- **THEN** further status changes and AgentEventBus events for that agent do not invoke the handlers

#### Scenario: Missing handlers are skipped
- **WHEN** a host calls `observe({ onState })` without `onEvent` or streaming handlers
- **THEN** only the state subscription is registered and unsubscribe still succeeds

### Requirement: Observe filters lifecycle events to the target agent

When `onEvent` is provided, the system SHALL invoke it only for AgentEventBus events whose `agentId` equals the observed managed agent id, except that `subagent:*` events MAY also be delivered when `event.parentId` equals the observed agent id and the event type is included in the subscription filter.

#### Scenario: Parent receives child subagent events
- **WHEN** a parent agent is observed with `onEvent` and an included `subagent:completed` fires for a child with `parentId` set to the parent
- **THEN** the parent’s `onEvent` handler is invoked

#### Scenario: Unrelated agent events are ignored
- **WHEN** another agent emits `agent:stop`
- **THEN** the observed agent’s `onEvent` handler is not invoked

### Requirement: Observe can subscribe to streaming output for the agent

When `onStreaming` / `onStreamingClear` are provided, the system SHALL deliver only streaming chunks cleared for that managed agent’s `agentId` scope.

#### Scenario: Streaming chunk for observed agent
- **WHEN** a tool under the observed agent emits a stdout chunk
- **THEN** `onStreaming` receives that chunk and agents observing a different id do not

### Requirement: Streaming subscribe is not a public host API

The published `@my-agent/core` entrypoint SHALL NOT export `subscribeStreamingCallback` / `subscribeStreamingClearCallback`. Hosts MUST receive streaming via `observe({ onStreaming })`. Internal validates MAY import subscribe helpers from `dev.ts`.

#### Scenario: Public package surface
- **WHEN** a host imports `@my-agent/core`
- **THEN** streaming subscribe helpers are unavailable and `ManagedAgent.observe` remains the subscribe path
