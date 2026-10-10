## MODIFIED Requirements

### Requirement: Wildcard subscription

`AgentEventBus` SHALL support a wildcard `"*"` subscription that receives observer events in scope. Interceptor events MUST NOT participate in wildcard delivery, and events classified as `internal` in the extension visibility table MUST NOT either, so that a subscriber which itself produces internal events cannot observe its own output. Wildcard delivery and the extension observation surface's broad subscription SHALL therefore agree on the same event set: every observable event. The system SHALL have exactly one wildcard consumer, and it SHALL be the built-in log extension.

#### Scenario: Wildcard receives all observer events

- **WHEN** a listener subscribes with `"*"` on a scope
- **THEN** every non-internal observer event emitted in that scope, regardless of name, is delivered to it

#### Scenario: Interceptor events excluded from wildcard

- **WHEN** an interceptor event such as `tool:before:read_file` is dispatched
- **THEN** a `"*"` observer listener does not receive it

#### Scenario: Internal events excluded from wildcard delivery

- **WHEN** an event classified `internal` (for example `tool:chunk`) is emitted in scope
- **THEN** a `"*"` observer listener does not receive it, so a subscriber that produces internal events cannot receive its own output

#### Scenario: Wildcard and broad observation agree

- **WHEN** a consumer compares the events a `"*"` listener receives with the events `observeAny` delivers
- **THEN** the two sets are equal

#### Scenario: One wildcard consumer

- **WHEN** a consumer inspects every `"*"` subscription in the repository
- **THEN** exactly one exists and it belongs to the log consumer
