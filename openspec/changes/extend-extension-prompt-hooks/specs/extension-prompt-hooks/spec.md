## ADDED Requirements

### Requirement: before_agent_start event per user prompt
The system SHALL emit an interceptable `before_agent_start` event on the ExtensionEventBus once per user prompt during prepare-for-run (not during session bootstrap, and not on tool-phase / steer continuations).

#### Scenario: Event fires before turn context snapshot
- **WHEN** a root agent prepares a new user prompt run
- **THEN** `before_agent_start` SHALL be emitted before the turn-context snapshot is captured

#### Scenario: Tool continuation skips the event
- **WHEN** prepare-for-run is a mid-turn tool continuation or marked continuation
- **THEN** `before_agent_start` SHALL NOT be emitted again for that prepare

#### Scenario: Subagent skips the event
- **WHEN** a subagent prepares a run
- **THEN** `before_agent_start` SHALL NOT be emitted

### Requirement: Append-only turn context and system segments
Extensions SHALL contribute situational text by mutating the `before_agent_start` event with `appendTurnContext` and/or `appendSystemPrompt`. The system SHALL concatenate non-empty contributions in interceptor registration order (joined by blank lines) and SHALL NOT replace the frozen system prompt.

#### Scenario: Chained appendTurnContext
- **WHEN** two extensions append turn-context strings `"A"` then `"B"`
- **THEN** the turn-context snapshot SHALL include both segments in that order

#### Scenario: Empty contributions ignored
- **WHEN** a handler leaves append fields empty or whitespace-only
- **THEN** those contributions SHALL be omitted from the concatenated result

#### Scenario: appendSystemPrompt stays after dynamic boundary
- **WHEN** an extension sets `appendSystemPrompt`
- **THEN** the text SHALL appear after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` for that user turn and SHALL NOT rewrite the frozen prefix

### Requirement: Turn context providers
The ExtensionContext SHALL provide `registerTurnContextProvider(fn)` that registers a callback returning optional string content. Providers SHALL run during turn-context snapshot capture; returned text SHALL be merged with `appendTurnContext` contributions.

#### Scenario: Provider contributes each turn
- **WHEN** an extension registers a provider that returns `"tab: example.com"`
- **THEN** each new user-turn snapshot SHALL include that text in the extension turn-context segment

#### Scenario: Provider can unregister
- **WHEN** the unsubscribe function returned by `registerTurnContextProvider` is called
- **THEN** subsequent snapshots SHALL NOT include that provider’s output
