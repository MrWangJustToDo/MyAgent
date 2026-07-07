## 1. Dependencies and Adapter Foundation

- [x] 1.1 Add `@tanstack/ai`, `@tanstack/ai-client`, `@tanstack/ai-ollama`, `@tanstack/ai-openai`, `@tanstack/ai-openrouter` to `packages/core/package.json`
- [x] 1.2 Create `packages/core/src/models/adapter-factory.ts` with `createTextAdapter()` for ollama, openai, open-router, openai-compatible providers
- [x] 1.3 Add smoke validation script that runs `chat()` with ollama adapter and a single user message
- [x] 1.4 Export adapter factory types from `packages/core/src/index.ts`

## 2. ManagedAgent Responsibility Split (Phase 1)

- [x] 2.1 Create `packages/core/src/managers/usage-tracker.ts` with `add()`, `getTotal()`, `reset()` from `RUN_FINISHED` usage
- [x] 2.2 Create `packages/core/src/managers/managed-agent.ts` type with status, session, memory, usage, ui, runner, tools fields
- [x] 2.3 Move `status` ownership from `Base`/`Agent` to `ManagedAgent`; update `RunOrchestrator` to accept `ManagedAgent`
- [x] 2.4 Move `MemoryService` and `SessionService` ownership from `Agent` to `ManagedAgent`
- [x] 2.5 Update `AgentManager.createManagedAgent()` to populate new `ManagedAgent` shape
- [x] 2.6 Move `dispatchEvent` / hook dispatch wiring to `AgentManager`; remove from `Base`
- [x] 2.7 Update `validate-agent-status.mjs` to assert status on `ManagedAgent`

## 3. AgentRunner (Phase 2)

- [x] 3.1 Create `packages/core/src/agent/runner/agent-runner.ts` wrapping TanStack `chat()`
- [x] 3.2 Create `packages/core/src/agent/runner/run-context.ts` for `ToolExecutionContext` (agentId, coreEnv, abortSignal)
- [x] 3.3 Create `packages/core/src/agent/middleware/compaction-middleware.ts` mapping micro/auto/reactive compact to `onConfig`
- [x] 3.4 Create `packages/core/src/agent/middleware/hooks-middleware.ts` bridging `HookRegistry` to `onBeforeToolCall` / `onAfterToolCall`
- [x] 3.5 Implement `AgentManager.runAgent(id, input, options)` calling `runner.run()` + temporary UI bridge
- [x] 3.6 Add `USE_TANSTACK_LOOP` feature flag to switch between Vercel and TanStack loop during migration
- [x] 3.7 Update `runSubagent()` to use `AgentRunner` when flag is enabled

## 4. Local Chat Connection (Phase 2–4)

- [x] 4.1 Implement `packages/core/src/connect/local-connect.ts` — `localConnect(agentId)` using TanStack `stream()` + `ConnectConnectionAdapter`
- [x] 4.2 Implement `AgentManager.runAgentStream(agentId, input)` returning `AsyncIterable<StreamChunk>` (yields from `AgentRunner.run()`)
- [x] 4.3 Wire `runAgentStream` to update `ManagedAgent.status`, `usage`, and lifecycle events
- [x] 4.4 Add validation script: `localConnect` + mock stream produces `UIMessage[]` via `ChatClient`
- [x] 4.5 Export `localConnect` from `@my-agent/core`

## 5. AgentUIChannel (subagent preview)

- [x] 5.1 Create `packages/core/src/managers/agent-ui-channel.ts` wrapping TanStack `StreamProcessor` (for subagent preview, not main CLI chat)
- [x] 5.2 Implement `subscribe()`, `consumeRun()`, `getMessages()` on `AgentUIChannel`
- [x] 5.3 Wire `onCustomEvent` for subagent progress events
- [x] 5.4 Replace `consume-subagent-ui-stream.ts` with `AgentUIChannel.consumeRun()` for subagent preview
- [x] 5.5 Update `subagent-preview-store.ts` to read from `AgentUIChannel` messages
- [x] 5.6 Add validation script for stream→UIMessage conversion (text, tool-call, tool-result parts)

## 6. TanStack Tools Migration (Phase 3)

- [x] 6.1 Create `packages/core/src/agent/tools/tanstack/` directory and `createTanStackTools()` factory
- [x] 6.2 Migrate read-only tools: `read_file`, `glob`, `grep`, `list_file`, `tree`
- [x] 6.3 Migrate write tools: `write_file`, `edit_file`, `delete_file`, `apply_patch`
- [x] 6.4 Migrate `run_command` with `needsApproval: true`
- [x] 6.5 Migrate `ask_user` as `toolDefinition().client()`
- [x] 6.6 Migrate `task` tool to spawn subagent with restricted `ServerTool[]`
- [x] 6.7 Migrate remaining tools: `webfetch`, `websearch`, `compact`, `list_skills`, `load_skill`, `todo`
- [x] 6.8 Update `AgentManager` tool wiring to use `ServerTool[]` instead of Vercel `ToolSet`
- [x] 6.9 Verify hook scripts (PreToolUse, PostToolUse) fire correctly via `HooksMiddleware`

## 7. App and CLI UI Migration (Phase 4)

- [ ] 7.1 Add `@tanstack/ai-react` to `packages/app/package.json`
- [ ] 7.2 Rewrite `packages/app/src/hooks/use-agent-chat.ts` on `@tanstack/ai-react useChat` with `connection: localConnect(agentId)`
- [ ] 7.3 Remove Vercel `@ai-sdk/react` and `DirectChatTransport` from app/cli
- [ ] 7.4 Update `packages/cli/src/local-adapter.ts` to pass `localConnect` into app init (no custom transport)
- [ ] 7.5 Update message part renderers for TanStack `MessagePart` types (`text.content`, `tool-call`, `tool-result`, `thinking`)
- [ ] 7.6 Update `ToolCallPartView`, `TaskToolInputView`, approval UI for TanStack part shapes
- [ ] 7.7 Wire `useChat` approval APIs (`addToolApprovalResponse`) to `run_command` `needsApproval` flow
- [ ] 7.8 Wire `useChat` client tool output APIs for `ask_user`
- [ ] 7.9 Update `use-task.ts` and subagent panel hooks for new message/event sources

## 8. Extension Remote Transport (Phase 4)

- [ ] 8.1 Add RPC/SSE endpoint on server to forward `StreamChunk` events from `AgentRunner`
- [ ] 8.2 Update extension adapter to use `fetchServerSentEvents(rpcUrl)` (HTTP connect, parallel to CLI `localConnect`)
- [ ] 8.3 Verify extension chat UI works with remote CoreEnv (no command streaming regression)

## 9. Session and Message Persistence

- [ ] 9.1 Decide and implement session file format (TanStack `UIMessage[]` vs `ModelMessage[]` + convert on load)
- [ ] 9.2 Update `SessionService` save/resume to use chosen message format; hydrate `useChat` `initialMessages`
- [ ] 9.3 Update `model-message-converter` utilities to TanStack `convertMessagesToModelMessages` / `normalizeToUIMessage`
- [ ] 9.4 Verify `/clear`, session resume, and compaction after resume

## 10. Complete Vercel AI SDK Removal (Phase 5 — required for done)

- [ ] 10.1 Audit all Vercel imports: `rg 'from "ai"|from "@ai-sdk' packages/` and track every file to migrate
- [ ] 10.2 Remove `Agent.ts`, `Base.ts`, and Vercel `Agent` interface implementation
- [ ] 10.3 Remove `packages/core/src/models/factory.ts` (Vercel `createModel`, `LanguageModel`, `wrapLanguageModel`, `extractReasoningMiddleware`)
- [ ] 10.4 Remove Vercel re-exports from `packages/core/src/index.ts` (`DirectChatTransport`, `ToolLoopAgent`, `LanguageModel`, `VercelUIMessage`)
- [ ] 10.5 Remove Vercel deps from `packages/core/package.json`: `ai`, `@ai-sdk/openai`, `@ai-sdk/deepseek`, `@ai-sdk/mcp`, `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `@ai-sdk/devtools`, `@openrouter/ai-sdk-provider`, `ai-sdk-ollama`
- [ ] 10.6 Remove Vercel deps from `packages/app/package.json`: `ai`, `@ai-sdk/react`
- [ ] 10.7 Remove Vercel deps from `packages/cli/package.json`: `ai`
- [ ] 10.8 Remove Vercel deps from `packages/extension/package.json`: `ai`, `@ai-sdk/react`
- [ ] 10.9 Replace `@ai-sdk/mcp` in `packages/node` with TanStack MCP or custom stdio transport (no Vercel MCP types)
- [ ] 10.10 Migrate `memory-retrieval.ts` off `streamText` to TanStack `chat()` or `summarize()`
- [x] 10.11 Migrate compaction modules off Vercel `ModelMessage` to TanStack `ModelMessage`
- [ ] 10.12 Remove `consume-subagent-ui-stream.ts` (Vercel `toUIMessageStream` / `readUIMessageStream`)
- [ ] 10.13 Remove `stop-conditions.ts` Vercel `StopCondition` types; use TanStack `agentLoopStrategy`
- [ ] 10.14 Remove `USE_TANSTACK_LOOP` feature flag (TanStack is the only path)
- [ ] 10.15 Run `pnpm install` and verify `pnpm why ai` returns nothing for all workspace packages
- [ ] 10.16 Run `rg 'from "ai"|from "@ai-sdk' packages/` — must return zero matches
- [ ] 10.17 Update `AGENTS.md` and `CLAUDE.md`: remove Vercel AI SDK sections; document TanStack-only architecture
- [ ] 10.18 Run `pnpm lint`, `pnpm format`, `pnpm build` and fix any errors

## 11. Validation

- [ ] 11.1 Manual test: basic CLI chat with ollama provider via `useChat` + `localConnect`
- [ ] 11.2 Manual test: `run_command` approval flow (y/n) via `useChat` approval APIs
- [ ] 11.3 Manual test: `ask_user` tool interaction via client tool output APIs
- [ ] 11.4 Manual test: `task` subagent with preview panel and summary streaming
- [ ] 11.5 Manual test: context compaction at high token usage
- [ ] 11.6 Manual test: session resume after restart (hydrate `useChat` initialMessages)
- [ ] 11.7 Manual test: extension remote mode with `fetchServerSentEvents` (if Phase 8 complete)
- [ ] 11.8 Verify zero Vercel SDK footprint: `rg 'from "ai"|from "@ai-sdk' packages/` and `pnpm why ai` in each package
