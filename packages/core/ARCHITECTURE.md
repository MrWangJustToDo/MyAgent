# @my-agent/core — Runtime Architecture

This document describes how `@my-agent/core` boots, initializes agents, and runs the main loops: session, tools (including approval), compaction, and memory.

For monorepo-wide context see [AGENTS.md](../../AGENTS.md). For public exports see [src/index.ts](./src/index.ts).

---

## Completion status (as of 2026-07)

| Area | Status | Notes |
|------|--------|-------|
| CoreEnv abstraction | **Done** | `registerCoreEnv` / `getEnv` |
| Agent factory & manager | **Done** | Root vs subagent split |
| TanStack agent loop | **Done** | `AgentRunner` + middleware stack |
| Event protocol + Event→Log bridge | **Done** | `AgentEventBus`, `event-log-bridge.ts` |
| Model config (`openai` / `anthropic`) | **Done** | `resolveModelConfig`, `createTextAdapter` |
| Session persistence | **Done** | Unified `persistSession`; `finalizeRun` on finish/abort/error |
| Compaction (micro / auto / reactive) | **Done** | + manual `/compact` in app |
| Memory (prefetch / extract / consolidate) | **Done** | Post-run extraction only |
| Tool approval | **Partial in core** | `needsApproval` on tools; UX in `@my-agent/app` |
| Hooks (`.agent-hooks`) | **Done** | Separate from user approval |

**Known gaps**

1. **Tool approval** — core marks tools; TanStack `useChat` + app keybindings handle UI.
2. **Subagents** — no session store, memory, MCP, or hooks (by design).

---

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Hosts: CLI (@my-agent/cli)  │  Extension (@my-agent/extension)   │
│   registerCoreEnv(node|remote)                                  │
│   @my-agent/app: createAgentFromConfig → useAgentChat           │
└────────────────────────────┬────────────────────────────────────┘
                             │ localConnect / createLocalConnect
┌────────────────────────────▼────────────────────────────────────┐
│ @my-agent/core                                                  │
│  AgentManager ──► ManagedAgent (composition root)               │
│    ├─ AgentContext      (LLM message store + compaction state)  │
│    ├─ SessionService    (persistence orchestration)             │
│    ├─ MemoryService     (prefetch / turn context / extraction)  │
│    ├─ RunCoordinator    (abort, reactive compact retries)       │
│    ├─ UsageTracker      (tokens, cost, window usage)            │
│    ├─ AgentLog          (debug log + UI notifications)          │
│    └─ AgentRunner       (TanStack chat + middleware)              │
│  AgentEventBus ──► hooks + Event→Log bridge                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ CoreEnv interface
┌────────────────────────────▼────────────────────────────────────┐
│ @my-agent/node (local)  │  @my-agent/server (remote HTTP RPC)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Startup entry points

### 1.1 Host bootstrap (CLI example)

```
packages/cli/src/index.tsx
  loadEnv()
  parseCliArgs()
  registerCoreEnv(createNodeEnv(...) | createRemoteCoreEnv(url))
  initConfig()
  render(<App />)
```

**Rule:** `registerCoreEnv()` must run before any `@my-agent/core` API that touches filesystem, shell, or platform.

### 1.2 App agent creation

```
packages/app/src/adapter/create-agent.ts
  resolveModelConfig({ model, style, baseURL, apiKey })
  agentManager.createManagedAgent({ modelInfo, modelStyle, ... })
  wire React stores (useAgent, useAgentLog, useAgentContext, useTodoManager)
  optional: continueLatestSession() / resumeSession() → initialMessages
```

### 1.3 Chat transport (in-process)

| API | File | Use |
|-----|------|-----|
| `localConnect(agentId)` | `connect/local-connect.ts` | Default CLI path; wraps TanStack `stream()` |
| `createLocalConnect(agentId, manager)` | same | Passes `threadId` / `runId` / `parentRunId` |
| `agentManager.runAgentStream(agentId, input)` | `managers/run-agent.ts` | Core streaming entry |

```typescript
// Simplified CLI path
useChat({
  connection: localConnect(agentId),
  // ...
});
```

### 1.4 Public vs internal APIs

| Symbol | Exported from `@my-agent/core`? |
|--------|----------------------------------|
| `agentManager`, `AgentManager` | Yes |
| `ManagedAgent`, `ManagedAgentConfig` | Yes |
| `localConnect`, `createLocalConnect` | Yes |
| `buildManagedAgent`, `getDefaultSkillDirs` | Yes |
| `attachEventLogBridge` | **No** — wired in `AgentManager` constructor |

---

## 2. Initialization process

### 2.1 `AgentManager.createManagedAgent(config, parentId?)`

```
manager-agent.ts
  buildManagedAgent({ config, manager, emit, getDefaultSkillDirs })
  agents.set(managed.id, managed)
  emitSessionBootstrapEvents(managed, bootstrap)   // root agents only
  link parent.childIds if subagent
```

### 2.2 `buildManagedAgent` wiring (`agent-factory.ts`)

**Root agent** (`!parentId`):

| Step | Action |
|------|--------|
| 1 | `new AgentContext`, `AgentLog`, `TodoManager`, `ManagedAgent` |
| 2 | `createTools()` → filesystem, grep, glob, tree, run_command, … |
| 3 | `managed.dispatchEvent = emit` (routes to `AgentEventBus`) |
| 4 | `loadAgentDoc()` → `setAgentDocContent` (AGENTS.md / CLAUDE.md) |
| 5 | `todo`, `webfetch`, `websearch`, `ask_user` tools |
| 6 | `SkillRegistry.loadFromDirectories` → `list_skills`, `load_skill`, `task` |
| 7 | `setCompactionConfig` from model context window |
| 8 | `McpManager.initialize` → merge MCP tools |
| 9 | `MemoryManager.initialize` → `setMemoryContent` (MEMORY.md index) |
| 10 | `HookRegistry.load` from `.agent-hooks/hooks.json` |
| 11 | `SessionStore` → `setSessionStore({ modelStyle, model })` |

**Subagent** (`parentId` set): inherits parent config via `spawnSubagent`; skips docs, skills, MCP, memory, hooks, session, and most root-only tools.

### 2.3 Event infrastructure (manager construct time)

```
AgentManager constructor
  new AgentEventBus(resolveHookTarget)
  attachEventLogBridge(bus, resolveLog)   // centralized lifecycle logging
```

### 2.4 Session bootstrap events (`session-bootstrap-events.ts`)

Emitted **after** the agent is registered (so Event→Log bridge can resolve `managed.log`):

| Event | When |
|-------|------|
| `session:doc` | Agent doc loaded |
| `session:skill` | Skills registered |
| `session:mcp` | MCP servers connected |
| `session:memory` | Memory index ready |
| `session:start` | Bootstrap complete (`cwd`) |

These also map to hook scripts where applicable (`SessionStart`, `Notification`, etc.) via `agent-event-bus.ts`.

**Note:** `session:start` does not create a `SessionData` file yet. The first on-disk session record is created lazily on first save.

---

## 3. Session start flow (user prompt → first LLM call)

### 3.1 `runAgentStream` pipeline

```
run-agent.ts: executeManagedAgentRun
  ensureAgentRunner(managed)          // build middleware + AgentRunner
  managed.prepareForRun({ messages, abortSignal })
  runStreamWithReactiveCompactRetry({ run: () => runner.run(...) })
```

### 3.2 `prepareForRun` (`managed-agent.ts`)

```
RunCoordinator.prepareMessages(input)
RunCoordinator.setupAbortController(abortSignal)
memory.prefetchRelevantMemories()     // see §7
emitEvent("prompt:submit", { prompt })
return finalMessages
```

### 3.3 Middleware stack (each LLM iteration)

Built in `buildAgentRunner` (`run-agent.ts`), order matters:

```
1. lifecycle-middleware     status, usage, thinking events, finalizeRun
2. compaction-middleware    micro + reasoning strip + auto-compact
3. turn-context-middleware  inject <turn_context> (memory, todo nag)
4. hooks-middleware         PreToolUse / PostToolUse scripts + tool events
```

### 3.4 Lifecycle status transitions

| Phase | Status | Trigger |
|-------|--------|---------|
| Run starts | `running` | `lifecycle.onStart` |
| Model reasoning | `thinking` | `REASONING_MESSAGE_*` chunk |
| Text output | `responding` | `TEXT_MESSAGE_CONTENT` |
| Tool call | `running` | `TOOL_CALL_START` |
| Auto-compact | `compacting` | compaction middleware |
| Success | `completed` / `idle` | `onFinish` |
| User abort | `aborted` | `onAbort` / `RunCoordinator` |
| Error | `error` | `onError` |

---

## 4. Tool approval flow

Core **declares** which tools need approval; **execution blocking** is handled by TanStack AI + `@my-agent/app`.

### 4.1 Core: `needsApproval: true`

Tools with approval required (`defineServerTool` in `tanstack/define-tool.ts`):

- `write_file`, `edit_file`, `delete_file`, `copy_file`, `move_file`
- `run_command`

Helper (available but not used by app today):

```typescript
managed.isToolNeedsApproval(toolName)  // managed-agent.ts
```

### 4.2 TanStack protocol

`AgentRunner.run()` → TanStack `chat({ tools, middleware })` emits stream chunks. When a tool has `needsApproval: true`, the stream includes approval request state on tool parts (`part.approval`).

### 4.3 App layer (not in core)

| Step | Location |
|------|----------|
| Detect pending approval | `use-agent-chat.ts` — scan `part.approval?.needsApproval && approved === undefined` |
| UI | `ToolCallPartView.tsx`, `Footer.tsx` (shows count when multiple pending) |
| Keyboard | `use-agent-keybindings.ts` — `y` approves **one** pending tool per press |
| Resume | `chat.addToolApprovalResponse({ id, approved })` — TanStack auto-continues when all tool parts are complete |

**Critical:** `AgentContext` stores **UIMessages** as the source of truth (`setUIMessages`). `runner.run()` reads `context.getUIMessages()` so TanStack `chat()` can extract `part.approval` before conversion. `getMessages()` / `getMessagesForLLM()` derive the model view on read (compaction middleware may overlay via `setMessages` during a run).

No manual user text is required; each `y` only approves one tool when several `run_command` calls are pending.

### 4.4 Hooks vs user approval (different mechanisms)

| Mechanism | File | Purpose |
|-----------|------|---------|
| **User approval** | TanStack + app | Block destructive tools until user confirms |
| **Hook deny** | `hooks-middleware.ts` → `runHooks(PreToolUse)` | Script-based deny/transform before tool runs |

Hook events also emit `agent:tool-start` / `agent:tool-end` / `agent:tool-error` for logging.

---

## 5. Compaction flow

Three proactive layers run on **every** LLM iteration (via `compaction-middleware.onConfig`), plus reactive retry on API errors.

### 5.1 Layer 1 — Micro compact

**File:** `agent/compaction/micro-compact.ts`

- Replaces old `role: "tool"` results with `"[Previous: used {tool_name}]"`
- Keeps N recent tool results (`keepRecentToolResults`, default 3)
- Skips small results (`minToolResultSize`)
- Protects `list_skills`, `load_skill`, `todo`, etc.

### 5.2 Layer 2 — Reasoning strip

**File:** `agent/middleware/compaction-middleware.ts` → `stripReasoningFromHistory`

- For DeepSeek models **without** the `reasoning` capability: strips `thinking` from non-tool-call assistant messages
- Skipped for reasoning-capable models (DeepSeek thinking mode requires `reasoning_content` echo-back)

### 5.3 Layer 3 — Auto compact

**Files:** `agent/compaction/auto-compact.ts`, `apply-compaction-result.ts`

**Trigger:** `shouldTriggerAutoCompact` when window input tokens ≥ `tokenThreshold × compactAtPercent / 100`

```
setStatus("compacting")
emit compaction:auto-start
autoCompact(messages, config, agentId, manager)
  → findCutPoint (keep recent flows)
  → summarizeConversation via runSubagent (no tools, 1 iteration)
applyCompactionResult(context, usage, result)
  → setSummaryMessage, setCompactIndex, reset window usage
emit compaction:auto-complete | compaction:auto-error
setStatus("running")
```

`AgentContext.getMessagesForLLM()` returns:

```
[summaryMessage, ...messages.slice(compactIndex)]
```

### 5.4 Reactive compact (emergency)

**Files:** `reactive-compact-retry.ts`, `reactive-compact.ts`, `managed-agent.handleReactiveCompact`

When the API returns `prompt_too_long`:

```
runStreamWithReactiveCompactRetry catches error
  → handleReactiveCompact (max 1 retry by default)
  → reactiveCompact: summarize + keep tail messages
  → applyReactiveCompactionResult
  → retry runner.run with updated messages
```

### 5.5 Manual `/compact`

**File:** `packages/app/src/commands/compact.ts`

Calls exported `autoCompact` + `applyCompactionResult` directly (same engine as auto-compact).

### 5.6 Configuration

```typescript
compaction: {
  tokenThreshold: 100_000,      // default from model contextWindow (capped)
  compactAtPercent: 80,         // trigger at 80% of threshold
  keepRecentToolResults: 3,
  keepRecentFlows: 4,
  minToolResultSize: 100,
}
```

Set via `ManagedAgentConfig.compaction` in `agent-factory.ts`.

---

## 6. Session flow

### 6.1 Storage

| Item | Value |
|------|-------|
| Directory | `.sessions/` |
| File | `{sessionId}.session.json` |
| Schema | `SessionData` v2 (`agent/session/types.ts`) |

Fields: `uiMessages`, `summaryMessage`, `compactIndex`, `usage`, `cost`, `contextTokens`, `todos`, `modelStyle`, `model`, metadata.

### 6.2 Write paths (unified persist)

| Trigger | Function | What is saved |
|---------|----------|---------------|
| **Run finalizes** (finish / abort / error) | `ManagedAgent.finalizeRun` → `SessionService.persistSession` | Model fields: `summaryMessage`, `compactIndex`, `usage`, `cost`, `contextTokens`, `todos`; auto-title if `"New Session"` |
| **Chat idle (app)** | `useAgentChat` effect → `updateSessionUIMessages` → `persistSession` | Same model fields **plus** `uiMessages` (single write) |

`SessionStore.save`: content-hash dedup, per-session write lock, full JSON overwrite.

**Run finalization** (`finalizeRun`):

| Reason | Session persist | Memory extraction | `agent:stop` |
|--------|-----------------|-------------------|--------------|
| `finished` | Yes | Yes (async) | `{ reason: "finished" }` |
| `aborted` | Yes | No | `{ reason: "aborted" }` |
| `error` | Yes | No | `{ reason: "error" }` |

Lifecycle middleware calls `onRunFinalize` once per run (`finalizeOnce` guard).

### 6.3 Resume

```
AgentManager.resumeSession(agentId, sessionId)
  → managed.restoreSession(sessionId)
    → SessionService.restoreFromStore
      → context.reset(); usage.reset()
      → context.setUIMessages(session.uiMessages)
      → restore summaryMessage, compactIndex, usage, todos

AgentManager.continueLatestSession(agentId)
  → store.getLatest() → resumeSession
```

App passes `initialMessages` from resume into `useChat`.

### 6.4 Context ↔ UI sync rules

**Message flow (expected contract):**

```
uiMessages (source of truth in AgentContext)
  → context.getUIMessages() → runner.run() / TanStack chat()
  → context.getMessages() → convert on read (or compaction overlay via setMessages)
  → context.getMessagesForLLM() → [summaryMessage, ...messages.slice(compactIndex)]
  → LLM (via compaction middleware onConfig)
```

- **Each run start** (`prepareForRun`): incoming `uiMessages` from `useChat` → `context.setUIMessages` (summary + `compactIndex` preserved).
- **After run idle** (`updateSessionUIMessages`): persist full `uiMessages` + model fields to session.
- **During active runs**: context is not overwritten from UI (unless `syncContext: true`) to avoid clobbering in-flight compaction state.
- **Manual `/compact`**: syncs UI → context, compacts LLM path only; UI history stays complete; `persistSession` saves both.

### 6.5 Session events

| Event | When |
|-------|------|
| `session:save-error` | `SessionStore.save` fails (target: `session`, `uiMessages`, or `session+uiMessages`) |

---

## 7. Memory flow

### 7.1 Static index (bootstrap → system prompt)

```
MemoryManager.initialize()     // .agent-memory/*.md + MEMORY.md
buildManagedAgent → setMemoryContent(index)
buildFrozenSystemPrompt → <memory_index> in frozen system prompt
```

### 7.2 Per-turn prefetch (before each run)

**`MemoryService.prefetchRelevantMemories`** — called from `prepareForRun`:

```
Extract last user message text
findRelevantMemories(query, manager, textAdapter, alreadySurfaced)
  → LLM side-query or keyword fallback, max ~5 memories
formatRelevantMemories → memory.relevantContent
emit memory:prefetch { status: injected | empty | skip-* | error }
```

### 7.3 Per-iteration injection

**`turn-context-middleware`** via `buildDynamicTurnContext`:

```
injectTurnContext(messages, dynamicContext)
  → insert <turn_context> user + assistant ack before latest user message
  → contains relevantMemoryContent + optional todo nag
```

### 7.4 Commit surfaced memories

**`lifecycle-middleware.onFirstModelOutput`** → `memory.commitSurfacedMemories()`:

- Adds prefetched filenames to `alreadySurfaced` so they are not re-injected next turn.

### 7.5 Post-run extraction & consolidation

**`MemoryService.runExtraction`** — async, fire-and-forget from `finalizeRun` when `reason === "finished"`:

```
Guard: manager exists, ≥15 messages, not already in progress
extractMemories → runSubagent → write .agent-memory/*.md files
  → emit memory:extract { status: start | complete | error }
If count >= consolidateThreshold:
  consolidateMemories → merge/delete via subagent
  → emit memory:consolidate
flushIndex → update memory.content for next session
```

**Only runs after successful finish** — not on abort or error.

---

## 8. Event system (cross-cutting)

### 8.1 Emission

```typescript
emitAgentEvent(emitter, type, { data })   // injects session_id
managed.emitEvent(type, data)
```

### 8.2 Event types (summary)

| Category | Events |
|----------|--------|
| Session bootstrap | `session:doc`, `session:skill`, `session:mcp`, `session:memory`, `session:start` |
| Run lifecycle | `prompt:submit`, `agent:thinking`, `agent:abort`, `agent:stream-error`, `agent:stop` |
| Tools | `agent:tool-start`, `agent:tool-end`, `agent:tool-error` |
| Memory | `memory:prefetch`, `memory:extract`, `memory:consolidate` |
| Compaction | `compaction:auto-*`, `compaction:reactive-*` |
| Session I/O | `session:save-error` |
| Subagent | `subagent:created`, `subagent:started`, `subagent:completed`, `subagent:error`, … |

### 8.3 Event → Log bridge

**File:** `managers/event-log-bridge.ts`

- Attached in `AgentManager` constructor
- `DEFAULT_EVENT_LOG_RULES` controls level/category/message per event
- Complex events (MCP, memory, compaction) use dedicated log handlers (no UI notify)
- Emit sites should **not** duplicate `log.info` for lifecycle events covered by the bridge

### 8.4 Hook bridge

`AgentEventBus` also maps select events to `.agent-hooks/hooks.json` scripts (`SessionStart`, `UserPromptSubmit`, `Stop`, `SubagentStart`, …).

Tool hooks (`PreToolUse`, `PostToolUse`) are invoked directly from `hooks-middleware.ts`, not via the event bus.

---

## 9. End-to-end run diagram

```
User sends message (useChat)
  │
  ▼
localConnect → agentManager.runAgentStream(agentId, { messages, abortSignal })
  │
  ▼
executeManagedAgentRun
  ├─ ensureAgentRunner (lazy build AgentRunner + middleware)
  ├─ prepareForRun
  │    ├─ memory.prefetchRelevantMemories
  │    └─ emit prompt:submit
  └─ runStreamWithReactiveCompactRetry
       └─ runner.run → TanStack chat()
            │
            ├─ [each iteration] compaction.onConfig
            │    ├─ microCompact
            │    ├─ stripReasoningFromHistory (DeepSeek)
            │    └─ autoCompact if threshold exceeded
            ├─ turn-context.onConfig → inject memory/todo
            ├─ hooks.onBeforeToolCall → PreToolUse + agent:tool-start
            ├─ [tool execute or approval pause]
            ├─ hooks.onAfterToolCall → PostToolUse + agent:tool-end
            └─ lifecycle.onFinish / onAbort / onError → finalizeRun (once)
                 ├─ session.persistSession (model state)
                 ├─ memory.runExtraction (async, finished only)
                 └─ emit agent:stop
  │
  ▼
[app] chat.status === "ready" → updateSessionUIMessages → persistSession (+ uiMessages)
```

---

## 10. Key file index

| Area | Primary files |
|------|---------------|
| Entry / connect | `connect/local-connect.ts`, `index.ts` |
| Manager | `managers/manager-agent.ts`, `managers/agent-factory.ts` |
| Agent runtime | `managers/managed-agent.ts`, `managers/run-agent.ts` |
| Runner | `agent/runner/agent-runner.ts` |
| Middleware | `agent/middleware/*.ts` |
| Events | `managers/agent-event-bus.ts`, `managers/emit-agent-event.ts`, `managers/event-log-bridge.ts` |
| Session | `managers/session-service.ts`, `agent/session/session-store.ts` |
| Memory | `managers/memory-service.ts`, `agent/memory/*.ts` |
| Compaction | `agent/compaction/*.ts` |
| Tools | `agent/tools/*.ts`, `agent/tools/tanstack/define-tool.ts` |
| Subagent | `agent/subagent/run-subagent.ts`, `agent/tools/task-tool.ts` |
| Models | `models/model-config.ts`, `models/adapter-factory.ts` |
| CoreEnv | `env.ts` (+ `@my-agent/node` / `@my-agent/server`) |

---

## 11. Validation scripts

```bash
pnpm --filter @my-agent/core run validate:emit-agent-event
pnpm --filter @my-agent/core run validate:event-log-bridge
pnpm --filter @my-agent/core run validate:tanstack-tools
pnpm --filter @my-agent/core run validate:compaction-messages
pnpm --filter @my-agent/core run validate:reactive-compact
pnpm --filter @my-agent/core run validate:subagent-run-stats
pnpm --filter @my-agent/core run validate:model-config
pnpm --filter @my-agent/core run validate:agent-context
```

Full package validation: `pnpm build:core` + `pnpm typecheck` (core tools typecheck clean as of recent fixes).
