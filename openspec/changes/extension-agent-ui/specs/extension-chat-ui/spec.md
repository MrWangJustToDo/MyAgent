## ADDED Requirements

### Requirement: Side panel chat interface
The extension SHALL provide a Chrome Side Panel that serves as the primary agent chat interface, displaying messages, handling input, and showing streaming responses.

#### Scenario: User opens chat panel
- **WHEN** user clicks the extension icon or uses the keyboard shortcut
- **THEN** the Chrome Side Panel opens with the chat interface showing connection status and an input field

#### Scenario: Panel persists across navigation
- **WHEN** the side panel is open and user navigates to a different page
- **THEN** the chat interface and conversation history remain intact

### Requirement: Message rendering
The extension SHALL render agent messages using `markstream-react` (built on `stream-markdown-parser`) with markdown formatting, streaming code highlighting, and distinct visual styles for user vs assistant messages.

#### Scenario: Render text message with markdown
- **WHEN** the agent responds with markdown content (headings, code blocks, lists)
- **THEN** the message is rendered as formatted HTML via `markstream-react` with syntax-highlighted code blocks

#### Scenario: Render streaming text
- **WHEN** the agent is generating a response
- **THEN** text appears incrementally as it streams in via `markstream-react`'s streaming mode, with a loading indicator

### Requirement: Tool call visualization
The extension SHALL display tool invocations with their name, inputs, status (running/complete/error), and outputs in a collapsible format.

#### Scenario: Display active tool call
- **WHEN** the agent invokes a tool (e.g., `read_file`)
- **THEN** the UI shows the tool name, a spinner, and the input parameters

#### Scenario: Display completed tool call
- **WHEN** a tool call completes
- **THEN** the UI shows a success icon, the tool name, and a collapsible output section

#### Scenario: Display failed tool call
- **WHEN** a tool call fails
- **THEN** the UI shows an error icon, the tool name, and the error message

### Requirement: Tool approval flow
The extension SHALL prompt the user to approve or deny tool executions that require approval, displaying the tool name and inputs before execution.

#### Scenario: Approve a tool
- **WHEN** a tool requests approval and user clicks "Approve"
- **THEN** the tool executes and the UI transitions to showing the tool output

#### Scenario: Deny a tool
- **WHEN** a tool requests approval and user clicks "Deny"
- **THEN** the tool is marked as denied, the agent receives the denial, and continues without executing

#### Scenario: Approve all pending tools
- **WHEN** multiple tools are pending approval and user clicks "Approve All"
- **THEN** all pending tools are approved in sequence

### Requirement: User input with multiline and file attachment
The extension SHALL provide a text input that supports multiline text (Shift+Enter) and image file attachments via paste or file picker.

#### Scenario: Send a message
- **WHEN** user types text and presses Enter (or clicks Send)
- **THEN** the message is sent to the agent and appears in the message list

#### Scenario: Multiline input
- **WHEN** user presses Shift+Enter
- **THEN** a newline is inserted in the input without sending

#### Scenario: Attach image
- **WHEN** user pastes an image or selects a file via the attachment button
- **THEN** the image appears as a preview in the input area and is sent with the message

### Requirement: Connection status display
The extension SHALL show the current connection status to the agent server (connected, disconnected, connecting) and guide the user to resolve connection issues.

#### Scenario: Server not running
- **WHEN** the extension cannot reach the agent server
- **THEN** the UI shows a disconnected state with instructions to start the server

#### Scenario: Connection established
- **WHEN** the extension successfully connects to the server
- **THEN** the UI shows a connected indicator with the model name

### Requirement: Todo list display
The extension SHALL display the agent's current todo list when tasks are active, showing task content, status, and progress.

#### Scenario: Show active todos
- **WHEN** the agent has created todos via the todo tool
- **THEN** a todo panel shows each task with its status (pending, in_progress, completed)

#### Scenario: Todo progress updates
- **WHEN** the agent updates a todo status
- **THEN** the todo panel reflects the change in real-time via streaming
