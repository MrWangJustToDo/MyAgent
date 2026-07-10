## Why

The current `Agent` class is tightly coupled to the Vercel AI SDK (`streamText`, `tool()`, `Agent` interface, `DirectChatTransport`, Vercel `UIMessage`). This makes the agent loop hard to evolve, forces state (status, session, memory, usage, hooks) onto the runner, and blocks a cleaner separation between execution and management. TanStack AI provides a function-based agent loop (`chat()`), AG-UI stream events, and a `StreamProcessor` that converts streams to `UIMessage[]` — matching our goal of keeping the LLM response stream while moving lifecycle concerns to `AgentManager`.

**This change MUST fully remove the Vercel AI SDK from the monorepo.** TanStack AI is the sole LLM runtime after completion — no dual-runtime, no compatibility shims, and no remaining `ai` / `@ai-sdk/*` dependencies in any workspace package.

## What Changes

- Replace Vercel AI SDK agent loop with TanStack AI `chat()` — **BREAKING** for any code depending on `Agent implements VercelAgent` or `streamText` internals
- Slim down `Agent` to a lightweight `AgentRunner` that only executes the loop; no status, session, memory, usage, or hooks on the runner itself
- Enrich `ManagedAgent` (via `AgentManager`) with `status`, `session`, `memory`, `usage`, and a new `ui` field (`AgentUIChannel`) for consuming the current agent's message stream
- Move event/hook dispatch to `AgentManager`; hooks bridge through TanStack `ChatMiddleware` (`onBeforeToolCall`, `onAfterToolCall`, `onConfig`)
- Replace `DirectChatTransport` + Vercel `@ai-sdk/react useChat` with TanStack `@tanstack/ai-react useChat` on CLI/app, using a **`localConnect`** in-process `ConnectConnectionAdapter` (no HTTP); extension remote mode uses `fetchServerSentEvents` / SSE over RPC
- Migrate tools from Vercel `tool()` to TanStack `toolDefinition().server()` / `.client()` — **BREAKING** for `ToolSet` shape (`Record` → `Array`)
- Migrate model factory from Vercel `LanguageModel` to TanStack text adapters (`ollamaText`, `openaiText`, `openrouterText`, etc.)
- Map compaction (`micro_compact`, `auto_compact`, `reactive_compact`) to `ChatMiddleware.onConfig` (replaces `prepareStep`)
- Migrate subagent preview from `toUIMessageStream` / `readUIMessageStream` to `AgentUIChannel.consumeRun`
- **Fully remove Vercel AI SDK** from all packages — **BREAKING**:
  - Remove `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/deepseek`, `@ai-sdk/mcp`, `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `@ai-sdk/devtools`, `@openrouter/ai-sdk-provider`, `ai-sdk-ollama` from workspace dependencies
  - Remove all `import ... from "ai"` and `import ... from "@ai-sdk/*"` across core, app, cli, extension, node
  - Remove `DirectChatTransport`, `ToolLoopAgent`, `streamText`, `tool()`, `convertToModelMessages`, Vercel `UIMessage` / `ToolSet` / `LanguageModel` from public `@my-agent/core` exports
  - Replace `@ai-sdk/mcp` stdio transport in `@my-agent/node` with TanStack MCP or retained custom transport (no Vercel MCP types)

## Capabilities

### New Capabilities

- `agent-runner`: Lightweight TanStack `chat()`-based loop executor with no lifecycle state; accepts adapter, tools, middleware, and returns `AsyncIterable<StreamChunk>`
- `managed-agent`: `ManagedAgent` as the single unit of management — owns status, context, session, memory, usage, tools, log, and parent/child relationships; all agent access goes through `AgentManager`
- `agent-ui-channel`: `AgentUIChannel` for subagent preview and non-hook consumers; main CLI chat uses TanStack `useChat` + `localConnect` (which uses `ChatClient`/`StreamProcessor` internally)
- `local-chat-connection`: In-process `ConnectConnectionAdapter` (`localConnect`) bridging `AgentManager.runAgentStream()` to `@tanstack/ai-react useChat` without HTTP
- `tanstack-tools`: Tool factory using `toolDefinition()` with Zod schemas, server/client sides, and `needsApproval` for command execution
- `tanstack-adapters`: Provider adapter factory producing TanStack text adapters and model strings (replacing Vercel `LanguageModel`)
- `vercel-sdk-removal`: Complete removal of Vercel AI SDK dependencies, imports, types, and re-exports from all workspace packages; zero `ai` / `@ai-sdk/*` in `pnpm-lock.yaml` dependency tree for application packages

### Modified Capabilities

- `model-message-converter`: Message conversion shifts from Vercel `convertToModelMessages` / `UIMessage` parts to TanStack `convertMessagesToModelMessages` / TanStack `UIMessage` part shapes (`text.content` vs `text.text`, `tool-call` vs `tool-invocation`)

## Impact

- **packages/core/src/agent/loop/**: `Agent.ts`, `Base.ts` replaced by `AgentRunner`; `RunOrchestrator` operates on `ManagedAgent`
- **packages/core/src/managers/**: `manager-agent.ts` expanded; new `agent-ui-channel.ts`, `usage-tracker.ts`, `managed-agent.ts`
- **packages/core/src/agent/tools/**: All tools migrated to `toolDefinition()`; `createTools()` returns `ServerTool[]`
- **packages/core/src/models/**: New `adapter-factory.ts`; `factory.ts` deprecated
- **packages/core/src/agent/middleware/**: New `compaction-middleware.ts`, `hooks-middleware.ts`
- **packages/core/src/agent/subagent/**: `consume-subagent-ui-stream.ts` replaced by `AgentUIChannel`
- **packages/app/src/hooks/use-agent-chat.ts**: Rewrite on `@tanstack/ai-react useChat` with `connection: localConnect(agentId)`; remove Vercel `@ai-sdk/react`
- **packages/app/src/messages/**: Part renderers adapt to TanStack `MessagePart` types
- **packages/cli/src/local-adapter.ts**: Remove `DirectChatTransport`; adapter provides `localConnect` to `useChat`
- **packages/core/src/connect/local-connect.ts** (new): `localConnect(agentId)` implementing TanStack `ConnectConnectionAdapter` via `stream()` helper
- **packages/extension/**: Remote transport forwards AG-UI `StreamChunk` events (Phase 4)
- **Dependencies (add)**: `@tanstack/ai`, `@tanstack/ai-client`, `@tanstack/ai-react`, `@tanstack/ai-ollama`, `@tanstack/ai-openai`, `@tanstack/ai-openrouter`
- **Dependencies (remove — all packages)**: `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/deepseek`, `@ai-sdk/mcp`, `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `@ai-sdk/devtools`, `@openrouter/ai-sdk-provider`, `ai-sdk-ollama`
- **packages/node**: Replace `@ai-sdk/mcp` `Experimental_StdioMCPTransport` with non-Vercel MCP transport
- **packages/core/src/index.ts**: Remove Vercel type re-exports (`LanguageModel`, `DirectChatTransport`, `ToolLoopAgent`, `VercelUIMessage`)
- **Root docs**: `AGENTS.md`, `CLAUDE.md` — remove Vercel AI SDK references; document TanStack AI as the only LLM integration
