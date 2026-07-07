## Context

The agent runtime in `@my-agent/core` currently centers on `Agent extends Base`, which implements the Vercel AI SDK `Agent` interface. The loop is driven by `streamText()`, tools are defined with `tool()`, models are Vercel `LanguageModel` instances, and the CLI connects UI via `DirectChatTransport` + `@ai-sdk/react useChat`. State (status, session, memory, usage, hooks, compaction) lives on or near the `Agent` instance even though `AgentManager` already wraps agents as `ManagedAgent`.

TanStack AI (`@tanstack/ai` v0.40) provides a function-based alternative:

- `chat({ adapter, model, messages, tools, systemPrompts, agentLoopStrategy, middleware })` → `AsyncIterable<StreamChunk>` (AG-UI protocol events from `@ag-ui/core`)
- `StreamProcessor` (`@tanstack/ai/client`) consumes chunks and maintains `UIMessage[]` with `onMessagesChange`
- `toolDefinition({ name, inputSchema }).server(execute)` / `.client()` replaces Vercel `tool()`
- `ChatMiddleware` with `onConfig` (per-iteration message transform), `onBeforeToolCall`, `onUsage` replaces `prepareStep` and hook injection points

A cloned reference repo lives at `tmp/tanstack-ai` for API analysis. Prior refactor work already extracted `RunOrchestrator`, `MemoryService`, `SessionService`, and unified `emitAgentEvent` — these compose cleanly into the new architecture.

## Goals / Non-Goals

**Goals:**

- **Completely remove Vercel AI SDK** from the monorepo — no `ai` or `@ai-sdk/*` packages, imports, or types remain in any workspace package after this change ships
- Replace Vercel agent loop with TanStack `chat()` while preserving all user-visible behavior (tools, approval, subagents, compaction, session resume)
- Make `AgentRunner` a lightweight loop executor (~150 lines) with no lifecycle state
- Move status, session, memory, usage, and UI consumption to `ManagedAgent` / `AgentManager`
- Add `ManagedAgent.ui` (`AgentUIChannel`) so any agent (main or subagent) can drive UI from the same stream→UIMessage path
- Migrate tools and model factory to TanStack patterns
- Support in-process UI for CLI (no HTTP transport) and AG-UI chunk forwarding for extension remote mode

**Non-Goals:**

- Keeping Vercel AI SDK as a fallback or compatibility layer (the `USE_TANSTACK_LOOP` flag is a **temporary** migration aid only and MUST be deleted before the change is considered complete)
- Maintaining Vercel `UIMessage` / `ToolSet` / `LanguageModel` type aliases in public API
- Rewriting compaction algorithms (logic moves to middleware, behavior unchanged)
- Replacing custom `McpManager` with TanStack built-in MCP (remote CoreEnv constraints remain; but `@ai-sdk/mcp` transport MUST still be removed from `@my-agent/node`)
- Migrating extension UI to `@tanstack/ai-react useChat` in the first pass (CLI first; extension follows)
- Supporting dual Vercel + TanStack runtimes indefinitely (parallel flag is temporary for migration only; **completion criterion is zero Vercel deps**)
- Changing subagent isolation semantics (fresh context, summary-only return)

## Decisions

### 1. AgentRunner replaces Agent + Base loop

**Decision:** Introduce `AgentRunner` that only calls TanStack `chat()` and yields `StreamChunk`. Remove `implements VercelAgent`, `streamText()`, and `Agent.stream()`.

**Rationale:** TanStack has no agent interface requirement. A thin runner keeps the loop testable and decoupled from management concerns.

**Alternatives considered:**
- Wrap TanStack inside existing `Agent` class: preserves API but keeps the fat class
- Use `@tanstack/ai-react useChat` on server: wrong layer; server should not depend on React

### 2. ManagedAgent owns all lifecycle state

**Decision:** `ManagedAgent` holds `status`, `context`, `session`, `memory`, `usage`, `ui`, `tools`, `log`, `runner`, and parent/child IDs. `AgentManager` is the only public entry point for create/run/destroy/approve.

**Rationale:** Matches user requirement that agents are accessed only through the manager; runner stays stateless between runs except config.

**Alternatives considered:**
- Keep status on runner with manager proxy: same confusion as today
- Split into multiple manager sub-objects: over-engineering for current scale

### 3. AgentUIChannel wraps StreamProcessor

**Decision:** `AgentUIChannel` owns a TanStack `StreamProcessor` with `onMessagesChange`, `onApprovalRequest`, `onCustomEvent`. `consumeRun(stream)` calls `processor.process(stream)`. Subagents get their own `AgentUIChannel` instance (or a lightweight view into a shared store).

**Rationale:** TanStack already implements stream→UIMessage; this directly replaces `toUIMessageStream` + `readUIMessageStream`. In-process CLI needs no `ChatClient` or SSE.

**Alternatives considered:**
- `ChatClient` with in-memory connection adapter: extra indirection, designed for HTTP
- Keep Vercel `UIMessage` conversion layer: doubles maintenance

### 4. Compaction maps to ChatMiddleware.onConfig

**Decision:** Implement `CompactionMiddleware` that runs `microCompact` on every iteration and `autoCompact` / `reactiveCompact` when thresholds or errors demand it, returning `{ messages: compacted }` from `onConfig`.

**Rationale:** `onConfig` fires at the start of each agent iteration — equivalent to Vercel `prepareStep` message mutation. Existing compaction modules stay intact.

**Alternatives considered:**
- Pre-process messages before `chat()`: misses per-iteration tool results
- Custom agent loop fork: loses TanStack tool execution and MCP integration

### 5. Hooks map to HooksMiddleware + AgentEventBus

**Decision:** Keep `HookRegistry` and `AgentEventBus` on `AgentManager`. `HooksMiddleware.onBeforeToolCall` / `onAfterToolCall` invoke hook scripts; lifecycle events (`prompt:submit`, `agent:finished`) emit via `emitAgentEvent` from middleware `onStart` / `onFinish`.

**Rationale:** Hook scripts are project-specific and already wired through the event bus. Middleware is the TanStack-native interception point.

### 6. Tools migrate to toolDefinition().server()

**Decision:** `createTanStackTools()` returns `ServerTool[]`. Each tool uses Zod v4 schemas. `run_command` sets `needsApproval: true`. `ask_user` uses `.client()` with no server execute.

**Rationale:** TanStack tools are arrays, not `Record<string, Tool>`. `needsApproval` maps to existing CLI y/n approval flow via `onApprovalRequest`.

**Alternatives considered:**
- Adapter wrapper converting Vercel `tool()` to TanStack at runtime: hides migration debt
- JSON Schema only (no Zod): loses existing schema investment

### 7. Model factory produces TanStack adapters

**Decision:** New `createTextAdapter(config)` returns `{ adapter: AnyTextAdapter, model: string }` using `@tanstack/ai-ollama`, `@tanstack/ai-openai`, `@tanstack/ai-openrouter`. Deprecate `createModel()` → Vercel `LanguageModel`.

**Rationale:** TanStack adapters are the `chat()` input; no `LanguageModel` intermediary.

**Alternatives considered:**
- Community bridge from Vercel models: fragile, not officially supported

### 8. UIMessage type: adopt TanStack UIMessage in app layer

**Decision:** Core and app use `@tanstack/ai` `UIMessage` and `MessagePart` types. App message components adapt part shapes (`text.content` vs `text.text`, `tool-call` vs `tool-invocation`).

**Rationale:** Avoids a permanent compatibility shim. One-time app layer update.

**Alternatives considered:**
- Internal UIMessage type with converters both ways: ongoing cost

### 9. CLI uses native TanStack `useChat` + `localConnect`

**Decision:** CLI and app use `@tanstack/ai-react` `useChat` with an in-process `ConnectConnectionAdapter` — `localConnect(agentId)` — instead of a custom `ManagedAgent.ui` subscription or Vercel `DirectChatTransport`.

TanStack already defines the adapter contract in `@tanstack/ai-client`:

```typescript
interface ConnectConnectionAdapter {
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, unknown>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): AsyncIterable<StreamChunk>
}
```

TanStack also ships `stream(streamFactory)` — a helper that wraps any async-iterable factory as a `ConnectConnectionAdapter`. Our `localConnect` is a thin wrapper:

```typescript
// packages/core/src/connect/local-connect.ts
import { stream } from "@tanstack/ai-client";

export function localConnect(agentId: string): ConnectConnectionAdapter {
  return stream((messages, data, abortSignal, runContext) =>
    agentManager.runAgentStream(agentId, { messages, data, abortSignal, runContext })
  );
}

// packages/app — useAgentChat
const chat = useChat({
  connection: localConnect(managed.id),
  tools: clientTools, // ask_user, etc.
});
```

`useChat` → `ChatClient` → internal `StreamProcessor` handles stream→`UIMessage[]`. No HTTP, no SSE, no custom message subscription loop.

**Rationale:** Reuses TanStack's native hook and client plumbing. `localConnect` is the only project-specific glue — same pattern as `fetchServerSentEvents('/api/chat')` but calls `AgentRunner` in-process. Source is small and easy to verify against `connection-adapters.ts`.

**Alternatives considered:**
- Custom `useAgentChat` subscribing to `ManagedAgent.ui`: duplicates what `useChat` + `ChatClient` already do
- `fetcher` returning `AsyncIterable<StreamChunk>`: works but `connection: stream(...)` is the documented TanStack pattern for server functions / in-process streams
- Keep Vercel `DirectChatTransport`: rejected (full Vercel removal)

**Extension contrast:** Extension uses `fetchServerSentEvents(rpcUrl)` or equivalent HTTP `ConnectConnectionAdapter`; only CLI/app local mode uses `localConnect`.

### 11. Complete Vercel AI SDK removal (hard requirement)

**Decision:** After migration, **zero** workspace packages depend on `ai` or any `@ai-sdk/*` package. All Vercel-specific APIs are deleted, not wrapped.

**Packages to clean:**

| Package | Vercel usage today | Replacement |
|---------|-------------------|-------------|
| `@my-agent/core` | `streamText`, `tool()`, `Agent`, `LanguageModel`, `convertToModelMessages`, `DirectChatTransport` re-export | TanStack `chat()`, `toolDefinition()`, `AgentRunner`, `createTextAdapter()` |
| `@my-agent/app` | Vercel `@ai-sdk/react useChat`, Vercel `UIMessage` helpers | `@tanstack/ai-react useChat` + `localConnect(agentId)` |
| `@my-agent/cli` | `ai` peer dep, `DirectChatTransport` | `localConnect` in-process; no HTTP transport |
| `@my-agent/extension` | `@ai-sdk/react`, `ChatTransport<UIMessage>` | `fetchServerSentEvents` / SSE RPC adapter (HTTP connect, not local) |
| `@my-agent/node` | `@ai-sdk/mcp` stdio transport | TanStack `@tanstack/ai-mcp` or custom stdio transport without Vercel types |

**Rationale:** Dual SDK maintenance is explicitly rejected. TanStack is the single source of truth for loop, tools, messages, and providers.

**Alternatives considered:**
- Keep `ai` only for types: still couples the repo to Vercel's release cycle and part-format churn
- Gradual deprecation with re-exports: hides incomplete migration; user requires full removal

### 10. Extension remote mode: forward StreamChunk over RPC

**Decision:** Server runs `AgentRunner` + `StreamProcessor` internally; RPC endpoint streams AG-UI chunks to extension. Extension uses `StreamProcessor` client-side or `@tanstack/ai-react` with SSE adapter — not Vercel `ChatTransport`.

**Rationale:** Minimizes extension changes in Phase 4; reuses existing Hono RPC infrastructure.

**Verification (for §11):** `rg 'from "ai"|from "@ai-sdk' packages/` returns no matches; `pnpm why ai` in each workspace package returns nothing.

## Architecture

```
AgentManager
  ├─ eventBus, hookRegistry
  ├─ runAgentStream(id, input) → AsyncIterable<StreamChunk>
  └─ agents: Map<id, ManagedAgent>
       ├─ status, context, session, memory, usage
       ├─ ui: AgentUIChannel (subagent preview / non-hook consumers)
       ├─ runner: AgentRunner (chat())
       ├─ tools: ServerTool[]
       └─ log, parentId, childIds

CLI local run flow (native hook):
  useChat({ connection: localConnect(agentId) })
    → ChatClient.send(messages)
    → localConnect.connect(messages, data, abortSignal, runContext)
    → agentManager.runAgentStream(agentId, …)
    → AgentRunner.run() → chat() → StreamChunk*
    → ChatClient StreamProcessor → messages state → React re-render
    → RUN_FINISHED → ManagedAgent.usage.add(usage)

Extension remote flow (HTTP connect):
  useChat({ connection: fetchServerSentEvents(rpcUrl) })
    → server runs AgentRunner + forwards AG-UI chunks over SSE/RPC
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| TanStack AI v0.40 API instability | Pin versions; isolate behind `AgentRunner` and adapter factory |
| UIMessage part format breaks app components | Phase 4 dedicated UI migration; update `MessageView` part switch |
| Compaction timing differs from `prepareStep` | Validation scripts comparing message output pre/post migration |
| Approval flow regression | Map `needsApproval` + `onApprovalRequest` to existing `addToolApprovalResponse` |
| Extension streaming gap | Phase 4 RPC chunk forwarding; CLI validated first |
| MCP remote CoreEnv | Keep `McpManager`; inject discovered tools into `chat({ tools })` |
| DeepSeek / niche providers | Use openai-compatible adapter or add adapter when needed |
| Temporary dual-runtime complexity | Feature flag `USE_TANSTACK_LOOP`; remove after Phase 5 |

## Migration Plan

| Phase | Scope | Validation |
|-------|-------|------------|
| **0 — Dependencies** | Add TanStack packages; `createTextAdapter()`; smoke `chat()` | Manual chat with ollama |
| **1 — Responsibility split** | Move status/session/memory/usage off Agent to ManagedAgent; no SDK swap | `validate-agent-status`, existing CLI |
| **2 — AgentRunner** | Replace `streamText` with `chat()`; `CompactionMiddleware` | CLI conversation + tools |
| **3 — Tools** | Migrate all tools to `toolDefinition()`; `HooksMiddleware` | Tool approval, ask_user, task |
| **4 — UI** | `localConnect` + `@tanstack/ai-react useChat`; `AgentUIChannel` for subagent preview | CLI chat, approval, subagent panel |
| **5 — Vercel removal** | Delete all `ai` / `@ai-sdk/*` deps, imports, re-exports; audit monorepo | `rg` clean, `pnpm build`, no Vercel in lockfile for app packages |

**Rollback:** Feature flag reverts to Vercel loop only during Phases 2–4. **Phase 5 completes only when Vercel is fully removed** — after that, rollback requires git revert.

## Completion Criteria

This change is **not done** until all of the following are true:

1. No `import ... from "ai"` or `import ... from "@ai-sdk/*"` in `packages/`
2. No `ai` or `@ai-sdk/*` entries in any workspace `package.json`
3. `@my-agent/core` does not re-export Vercel types or transports
4. `pnpm build` and manual regression pass on TanStack-only path
5. `AGENTS.md` documents TanStack AI as the sole LLM SDK

## Open Questions

1. **Extension timing:** Migrate extension in Phase 4 or defer to a follow-up change?
2. **Session persistence format:** Store TanStack `UIMessage[]` in session files directly, or keep ModelMessage[] on disk with conversion at load?
3. **DeepSeek adapter:** Use openai-compatible endpoint or wait for `@tanstack/ai` DeepSeek package?
4. **Public API exports:** Should `@my-agent/core` re-export TanStack types or expose thin aliases?
