## ADDED Requirements

### Requirement: HTTP implements the same AgentSession contract
The HTTP agent plane SHALL expose snapshot, command, and event-stream endpoints whose client wrapper implements the same `AgentSession` interface as LocalAgentSession (method names and command/channel discriminants).

#### Scenario: HTTP client dispatch stop
- **WHEN** `HttpAgentSessionClient.dispatch({ type: "stop" })` is called against a running remote session
- **THEN** the server maps the command to the in-process session stop behavior and the client receives a structured command result

### Requirement: SSE delivers channel-tagged events
The events endpoint SHALL stream session events as channel-tagged frames (SSE or equivalent) so that subscribers can demux `state`, `messages`, `queues`, `usage`, `todos`, `plan`, `tool`, `summary`, and `lifecycle` the same way as Local subscribe.

#### Scenario: Messages frame on SSE
- **WHEN** the remote agent UI messages change
- **THEN** the events stream emits a frame whose channel is `messages` and whose payload includes the full messages array

### Requirement: Agent plane is separate from CoreEnv routes
Agent session HTTP routes SHALL live under a distinct path prefix from CoreEnv workspace routes (`/api/fs`, `/api/command`, etc.) so language-agnostic frontends can attach to agent control without conflating workspace I/O.

#### Scenario: Snapshot path is under agent prefix
- **WHEN** a client fetches an agent snapshot over HTTP
- **THEN** the URL path is under an `/api/agent` (or equivalent agent-dedicated) prefix, not under `/api/fs`

### Requirement: Create and close remote sessions
The HTTP API SHALL support creating (or binding) an agent session with model/config inputs and closing it, so a remote UI can start and tear down an agent without in-process `agentManager` access.

#### Scenario: Create then snapshot
- **WHEN** a client creates a remote agent session successfully
- **THEN** a subsequent snapshot request for that session id returns a valid AgentSessionSnapshot

### Requirement: Subagent ids use the same HTTP AgentSession routes
HTTP snapshot, command, and events endpoints SHALL accept subagent managed-agent ids with the same path shape as root agents, so remote UIs reuse one client implementation for parent and child sessions.

#### Scenario: Child snapshot over HTTP
- **WHEN** a client requests `GET /api/agent/:subagentId/snapshot` for an existing subagent
- **THEN** the response is an AgentSessionSnapshot for that subagent (same schema as a root agent snapshot)
