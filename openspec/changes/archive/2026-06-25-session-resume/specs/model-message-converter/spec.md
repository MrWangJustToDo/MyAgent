## ADDED Requirements

### Requirement: Convert user messages
The system SHALL convert ModelMessage with role "user" to UIMessage with role "user", mapping text content to text parts and file/image content to file parts.

#### Scenario: Plain text user message
- **WHEN** a ModelMessage has role "user" and string content "Hello"
- **THEN** the output UIMessage has role "user" with a single text part containing "Hello"

#### Scenario: Multi-part user message
- **WHEN** a ModelMessage has role "user" with array content containing text and image parts
- **THEN** the output UIMessage has role "user" with corresponding text and file parts

### Requirement: Convert assistant messages
The system SHALL convert ModelMessage with role "assistant" to UIMessage with role "assistant", mapping text to text parts, reasoning to reasoning parts, and tool-call to tool-call parts with state "input-available".

#### Scenario: Text-only assistant message
- **WHEN** a ModelMessage has role "assistant" with text content
- **THEN** the output UIMessage has role "assistant" with a text part

#### Scenario: Assistant with tool calls
- **WHEN** a ModelMessage has role "assistant" with tool-call parts
- **THEN** the output UIMessage has role "assistant" with tool parts containing toolCallId, toolName, input, and state "input-available"

#### Scenario: Assistant with reasoning
- **WHEN** a ModelMessage has role "assistant" with reasoning parts
- **THEN** the output UIMessage has role "assistant" with reasoning parts containing the text

### Requirement: Merge tool results into assistant messages
The system SHALL merge ModelMessage with role "tool" (containing tool-result parts) into the preceding assistant UIMessage's tool-call parts, setting their state to "output-available" and populating the output field.

#### Scenario: Tool result merged
- **WHEN** a ModelMessage with role "tool" follows an assistant message with matching toolCallId
- **THEN** the corresponding tool part in the assistant UIMessage is updated with output and state "output-available"

#### Scenario: Tool error result
- **WHEN** a tool result contains an error indicator
- **THEN** the tool part state is set to "output-error" with errorText populated

### Requirement: Generate stable message IDs
The system SHALL generate deterministic IDs for converted UIMessages based on their position in the message array, ensuring consistent IDs across multiple conversions of the same messages.

#### Scenario: Consistent IDs
- **WHEN** the same ModelMessage array is converted twice
- **THEN** the resulting UIMessage IDs are identical both times

### Requirement: Handle system messages
The system SHALL skip ModelMessage with role "system" during conversion since system prompts are not displayed in the UI.

#### Scenario: System message skipped
- **WHEN** a ModelMessage array contains a system message
- **THEN** it is not included in the output UIMessage array
