## ADDED Requirements

### Requirement: Interceptable tool_call event
The system SHALL emit an interceptable `tool_call` event before tool execution, allowing extensions to block or request approval.

#### Scenario: Extension blocks tool execution
- **WHEN** an extension handler returns `{ block: true, reason: "not allowed" }`
- **THEN** the tool SHALL NOT execute and the agent SHALL receive an error message containing the reason

#### Scenario: Extension requests approval for tool
- **WHEN** an extension handler returns `{ needsApproval: true }`
- **THEN** the tool SHALL enter the approval flow before execution

#### Scenario: Multiple extension handlers
- **WHEN** multiple extensions subscribe to `tool_call`
- **THEN** each handler SHALL receive the event in registration order; the first `block` SHALL short-circuit subsequent handlers

#### Scenario: No extension blocks
- **WHEN** no extension handler blocks or requests approval
- **THEN** the tool SHALL execute normally

### Requirement: Interceptable tool_result event
The system SHALL emit an interceptable `tool_result` event after tool execution, allowing extensions to modify the result content.

#### Scenario: Extension modifies tool output
- **WHEN** an extension handler returns `{ content: [{ type: "text", text: "modified" }] }`
- **THEN** the modified content SHALL replace the original tool output in the LLM context

#### Scenario: Multiple modifiers chain
- **WHEN** multiple extensions modify `tool_result`
- **THEN** modifications SHALL be chained: each handler receives the accumulated result from previous handlers

### Requirement: Interceptable input event
The system SHALL emit an interceptable `input` event when the user submits input, allowing extensions to transform or handle it.

#### Scenario: Extension transforms input
- **WHEN** an extension handler returns `{ action: "transform", text: "modified input" }`
- **THEN** the modified text SHALL replace the original user input

#### Scenario: Extension handles input
- **WHEN** an extension handler returns `{ action: "handled" }`
- **THEN** the input SHALL be consumed and NOT passed to the agent

### Requirement: Context modification event
The system SHALL emit a `context` event before messages are serialized to the LLM, allowing extensions to modify the message list.

#### Scenario: Extension injects system message
- **WHEN** an extension handler modifies the message list
- **THEN** the modified messages SHALL be sent to the LLM instead of the original

### Requirement: before_agent_start event
The system SHALL emit a `before_agent_start` event during session bootstrap, allowing extensions to inject custom system prompt segments.

#### Scenario: Extension appends to system prompt
- **WHEN** an extension handler returns `{ systemPrompt: "Always respond in Chinese" }`
- **THEN** the returned string SHALL be appended to the system prompt

### Requirement: Notification-only events forwarded to AgentEventBus
Non-interceptable lifecycle events (session lifecycle, tool execution lifecycle without return values) SHALL be forwarded to `AgentEventBus` for logging and metrics consumption.

#### Scenario: Tool execution start logged
- **WHEN** a tool starts execution
- **THEN** the `agent:tool-start` event SHALL be emitted on `AgentEventBus` and available to event log subscribers

#### Scenario: Extension event ordering
- **WHEN** a tool call is made
- **THEN** events SHALL fire in this order: `tool_call` (ExtensionEventBus, interceptable) → execution → `tool_result` (ExtensionEventBus, interceptable) → `agent:tool-end` (AgentEventBus, notification)
