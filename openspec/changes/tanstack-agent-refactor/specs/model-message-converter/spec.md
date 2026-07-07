## MODIFIED Requirements

### Requirement: Convert user messages

The system SHALL convert `ModelMessage` with role `user` to TanStack `UIMessage` with role `user`, mapping text content to `{ type: "text", content: string }` parts and multimodal content to `image` / `audio` / `video` / `document` parts.

#### Scenario: Plain text user message

- **WHEN** a `ModelMessage` has role `user` and string content `"Hello"`
- **THEN** the output `UIMessage` has role `user` with a single text part `{ type: "text", content: "Hello" }`

#### Scenario: Multi-part user message

- **WHEN** a `ModelMessage` has role `user` with array content containing text and image parts
- **THEN** the output `UIMessage` has role `user` with corresponding text and image parts

### Requirement: Convert assistant messages

The system SHALL convert `ModelMessage` with role `assistant` to TanStack `UIMessage` with role `assistant`, mapping text to text parts, reasoning to `{ type: "thinking", content }` parts, and tool calls to `{ type: "tool-call", id, name, arguments, state }` parts.

#### Scenario: Text-only assistant message

- **WHEN** a `ModelMessage` has role `assistant` with text content
- **THEN** the output `UIMessage` has role `assistant` with a text part using `content` field

#### Scenario: Assistant with tool calls

- **WHEN** a `ModelMessage` has role `assistant` with tool-call content
- **THEN** the output `UIMessage` has role `assistant` with `tool-call` parts containing `id`, `name`, `arguments` (JSON string), and `state`

#### Scenario: Assistant with reasoning

- **WHEN** a `ModelMessage` has role `assistant` with reasoning content
- **THEN** the output `UIMessage` has role `assistant` with `thinking` parts containing the reasoning text

### Requirement: Tool results as separate parts on assistant messages

The system SHALL represent tool results as `{ type: "tool-result", toolCallId, content, state }` parts on the assistant `UIMessage`, not merged into tool-call output fields.

#### Scenario: Tool result on assistant message

- **WHEN** a `ModelMessage` with role `tool` follows an assistant message with matching `toolCallId`
- **THEN** the assistant `UIMessage` includes a `tool-result` part with `toolCallId`, string or structured `content`, and `state: "complete"`

#### Scenario: Tool error result

- **WHEN** a tool result indicates an error
- **THEN** the `tool-result` part has `state: "error"` and an `error` field populated

### Requirement: Generate stable message IDs

The system SHALL generate deterministic IDs for converted `UIMessage` instances based on their position in the message array, ensuring consistent IDs across multiple conversions of the same messages.

#### Scenario: Consistent IDs

- **WHEN** the same `ModelMessage` array is converted twice via TanStack `convertMessagesToModelMessages` / `normalizeToUIMessage`
- **THEN** the resulting `UIMessage` IDs are identical both times

### Requirement: Handle system messages

The system SHALL represent system prompts as `UIMessage` with role `system` and text parts, or pass them via `chat({ systemPrompts })` without displaying them in the chat UI.

#### Scenario: System message excluded from chat UI

- **WHEN** a `ModelMessage` array contains a system message
- **THEN** it is either passed as `systemPrompts` to `chat()` or stored as a system `UIMessage` not rendered in the user/assistant transcript view

## REMOVED Requirements

### Requirement: Merge tool results into assistant messages

**Reason**: TanStack `UIMessage` uses separate `tool-result` parts instead of merging output into `tool-call` parts (Vercel `tool-invocation` pattern).

**Migration**: UI components read `tool-result` parts adjacent to `tool-call` parts on the same assistant message. `StreamProcessor` maintains this structure during streaming.
