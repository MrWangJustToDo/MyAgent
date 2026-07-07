## ADDED Requirements

### Requirement: Zero Vercel AI SDK dependencies

The system SHALL NOT depend on the `ai` package or any `@ai-sdk/*` package in any workspace package after this change is complete.

#### Scenario: package.json audit

- **WHEN** all migration tasks are complete
- **THEN** no workspace `package.json` lists `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/deepseek`, `@ai-sdk/mcp`, `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `@ai-sdk/devtools`, `@openrouter/ai-sdk-provider`, or `ai-sdk-ollama` as dependencies
- **AND** `pnpm why ai` run from each package directory returns no dependency chain

#### Scenario: Source import audit

- **WHEN** searching `packages/` for `from "ai"` or `from "@ai-sdk`
- **THEN** zero matching import statements remain

### Requirement: No Vercel types in public core exports

The system SHALL NOT re-export Vercel AI SDK types or transports from `@my-agent/core`.

#### Scenario: Core index exports

- **WHEN** inspecting `packages/core/src/index.ts`
- **THEN** it does not export `DirectChatTransport`, `ToolLoopAgent`, `LanguageModel`, or Vercel `UIMessage` aliases
- **AND** public message types come from `@tanstack/ai` or thin project aliases over TanStack types

### Requirement: No Vercel runtime APIs in agent loop

The system SHALL NOT call Vercel runtime APIs anywhere in the agent execution path.

#### Scenario: Loop execution

- **WHEN** an agent run executes (main agent or subagent)
- **THEN** the loop uses TanStack `chat()` only
- **AND** does not call `streamText`, `generateText`, `toUIMessageStream`, `readUIMessageStream`, or `convertToModelMessages` from the `ai` package

#### Scenario: Tool definitions

- **WHEN** tools are registered for an agent
- **THEN** they are defined with TanStack `toolDefinition()`
- **AND** not with Vercel `tool()`

### Requirement: No Vercel UI integration

The system SHALL NOT use `@ai-sdk/react` or Vercel `ChatTransport` for chat UI integration.

#### Scenario: CLI chat hook

- **WHEN** the CLI renders chat messages
- **THEN** `useAgentChat` uses `@tanstack/ai-react useChat` with `connection: localConnect(agentId)`
- **AND** does not import `useChat` from `@ai-sdk/react` or construct `DirectChatTransport`

#### Scenario: Extension adapter

- **WHEN** the extension connects to a remote agent
- **THEN** it uses `fetchServerSentEvents` or equivalent HTTP `ConnectConnectionAdapter`
- **AND** does not use Vercel `ChatTransport<UIMessage>` or `localConnect`

### Requirement: MCP transport without Vercel

The system SHALL NOT use `@ai-sdk/mcp` for MCP stdio transport.

#### Scenario: Node MCP stdio

- **WHEN** `@my-agent/node` creates an MCP stdio transport
- **THEN** it uses TanStack `@tanstack/ai-mcp` or a custom transport implementation
- **AND** does not import from `@ai-sdk/mcp`

### Requirement: Memory and compaction without Vercel types

The system SHALL use TanStack `ModelMessage` and `UIMessage` types in compaction, session, and memory modules.

#### Scenario: Compaction message types

- **WHEN** compaction modules process conversation history
- **THEN** they use TanStack message types and converters
- **AND** do not import `ModelMessage` from the `ai` package

#### Scenario: Memory retrieval

- **WHEN** memory retrieval performs an LLM call for relevance ranking
- **THEN** it uses TanStack `chat()` or `summarize()`
- **AND** does not call Vercel `streamText`
