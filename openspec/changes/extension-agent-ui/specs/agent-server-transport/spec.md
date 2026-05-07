## ADDED Requirements

### Requirement: HTTP chat endpoint
The server SHALL expose a `POST /api/chat` endpoint that accepts Vercel AI SDK chat protocol messages and returns a `UIMessageStream` response.

#### Scenario: Send user message
- **WHEN** the extension sends a POST request with `{ messages: [...] }` to `/api/chat`
- **THEN** the server streams back the agent's response in Vercel AI SDK UI message stream format

#### Scenario: Send message with file attachments
- **WHEN** the extension sends a POST with messages containing `FileUIPart` data (base64 images)
- **THEN** the server passes the files to the agent and streams back the response

### Requirement: Tool approval over HTTP
The server SHALL support the Vercel AI SDK tool approval protocol, allowing the client to send approval/denial responses that the agent receives.

#### Scenario: Client approves a tool
- **WHEN** the server streams a tool call with `approval-requested` state and the client sends an approval response in the next request
- **THEN** the agent receives the approval and executes the tool

#### Scenario: Client denies a tool
- **WHEN** the client sends a denial response for a pending tool
- **THEN** the agent receives the denial with the reason and continues without executing

### Requirement: Agent lifecycle management
The server SHALL create and manage a single Agent instance, initializing it on startup with configured model/provider settings.

#### Scenario: Server startup
- **WHEN** the server starts
- **THEN** it creates an Agent via `agentManager.createManagedAgent()` with the configured model, provider, and root path

#### Scenario: Server reads configuration
- **WHEN** the server starts
- **THEN** it reads model, provider, API key, and root path from environment variables (`.env`)

#### Scenario: Agent error handling
- **WHEN** the agent encounters an error during streaming
- **THEN** the server returns the error in the stream format so the client can display it

### Requirement: CORS configuration
The server SHALL allow requests from `chrome-extension://` origins to enable the browser extension to connect.

#### Scenario: Extension makes request
- **WHEN** a request arrives from a `chrome-extension://<id>` origin
- **THEN** the server includes appropriate CORS headers allowing the request

#### Scenario: Unknown origin request
- **WHEN** a request arrives from `http://localhost` (for development)
- **THEN** the server allows the request (development mode)

### Requirement: Server health endpoint
The server SHALL expose a `GET /api/health` endpoint that returns the server status, model info, and agent readiness.

#### Scenario: Health check when ready
- **WHEN** a GET request is made to `/api/health` and the agent is initialized
- **THEN** the server returns `{ status: "ready", model: "<name>", provider: "<provider>" }`

#### Scenario: Health check during initialization
- **WHEN** a GET request is made to `/api/health` before agent is ready
- **THEN** the server returns `{ status: "initializing" }`

### Requirement: Abort/stop streaming
The server SHALL support aborting an in-progress stream when the client disconnects or sends a stop signal.

#### Scenario: Client disconnects mid-stream
- **WHEN** the client closes the HTTP connection while the agent is streaming
- **THEN** the server aborts the agent's stream via `AbortSignal`

#### Scenario: Client sends stop request
- **WHEN** the client sends a POST to `/api/chat/stop`
- **THEN** the current agent stream is aborted and the server confirms
