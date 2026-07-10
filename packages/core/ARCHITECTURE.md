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
| Tool approval | **Done in core** | `approval` middleware + `needsApproval` on tools; app handles UI/keyboard only |
| Hooks (`.agent-hooks`) | **Done** | Separate from user approval |

**Known gaps**

1. **Tool approval** — core `AgentChatController` owns tool-phase continuation; app handles UI/keyboard only.
2. **Subagents** — no session store, memory, MCP, or hooks (by design).

---

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Hosts: CLI (@my-agent/cli)  │  Extension (@my-agent/extension)   │
│   registerCoreEnv(node|remote)                                  │
│   @my-agent/app: createAgentFromConfig → useAgentChat           │
└────────────────────────────┬────────────────────────────────────┘
                             │ AgentChatController → runAgentStream
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
| `ManagedAgent.initChat(manager, initialMessages?)` | `managers/agent-chat-controller.ts` | Main CLI chat session |
| `AgentChatController.sendMessage` / `respondToToolApproval` | same | User turns + tool-phase continuation |
| `agentManager.runAgentStream(agentId, input)` | `managers/run-agent.ts` | Core streaming entry |
| `localConnect`, `createLocalConnect` | `connect/local-connect.ts` | Legacy / tests only |

### 1.4 Public vs internal APIs

| Symbol | Exported from `@my-agent/core`? |
|--------|----------------------------------|
| `agentManager`, `AgentManager` | Yes |
| `ManagedAgent`, `ManagedAgentConfig` | Yes |
| `AgentChatController`, `ManagedAgent.initChat` | Yes |
| `localConnect`, `createLocalConnect` | Yes (legacy) |
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
if !isToolContinuationPrepare(agent.status, messages):
  memory.prefetchRelevantMemories()     // see §7
  emitEvent("prompt:submit", { prompt })
return finalMessages
```

`isToolContinuationPrepare` uses existing state — no extra run-phase field:
- `status === "waiting"` (approval pause), or
- last message is not `user` (tool-phase / approval continuation within the same turn).

### 3.3 Middleware stack (each LLM iteration)

Built in `buildAgentRunner` (`run-agent.ts`), order matters:

```
1. status-middleware         status transitions only (via AgentStatusController)
2. lifecycle-middleware      usage tracking, thinking events, memory commit, finalizeRun
3. compaction-middleware     reasoning strip + auto-compact (status via AgentStatusController)
4. tool-compact-middleware  per-tool LLM shaping
5. turn-context-middleware  inject <turn_context> (memory, todo nag)
6. hooks-middleware         PreToolUse / PostToolUse scripts + tool events
```

Status logic is centralized in `AgentStatusController` (`managers/agent-status-controller.ts`). `status-middleware` is the runtime hook for status; `lifecycle-middleware` owns usage and run finalization side-effects. `AgentChatController` calls `prepareRunPhase` / `reconcileAfterRun` for pump boundaries.

### 3.4 Lifecycle status transitions

| Phase | Status | Trigger |
|-------|--------|---------|
| Run starts | `running` | `status.onRunStart` / `prepareRunPhase` |
| Model reasoning | `thinking` | `REASONING_MESSAGE_*` chunk |
| Text output | `responding` | `TEXT_MESSAGE_CONTENT` |
| Tool call | `running` | `TOOL_CALL_START` |
| Tool approval pending | `waiting` | `status.syncApprovals` on `onToolPhaseComplete` |
| Client tool (`ask_user`) | `awaiting_user` | App host calls `ManagedAgent.setClientToolWaiting(true)` |
| Auto-compact | `compacting` | `status.beginCompaction` |
| Success | `completed` / `idle` | `onRunFinish` (preserves `waiting` / `awaiting_user` if set) |
| Stream ended, tools waiting | `completed` / `waiting` | `statusController.reconcileAfterRun` after `pumpToolPhases` |
| User abort | `aborted` | `onRunAbort` / `onUserCancel` / `RunCoordinator` |
| Error | `error` | `onRunError` / `onExternalError` |

---

## 4. Tool approval flow

Core **declares** which tools need approval and **owns agent status** during the approval pause. **Execution blocking** and resume are still handled by TanStack AI + `@my-agent/app` (`addToolApprovalResponse`).

### 4.1 Core: `needsApproval: true` + status middleware

`createStatusMiddleware` (`agent/middleware/status-middleware.ts`) delegates approval transitions to `AgentStatusController`:

| Hook | Action |
|------|--------|
| `onToolPhaseComplete` | When `info.needsApproval.length > 0`: `waiting`, `setPendingApprovalCount`, emit `agent:tool-approval-request` per tool |
| `onBeforeToolCall` | When status is `waiting`: clear count, `running` (approved tool executing) |

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
| Chat session | **core** `AgentChatController` — `StreamProcessor` + `pumpToolPhases()` |
| App hook | `use-agent-chat.ts` — subscribes to controller messages + `ManagedAgent.subscribeState()` |
| Detect pending approval (UI) | `use-agent-chat.ts` — `isPendingToolApproval()` for keyboard / input mode |
| Agent status | **core** `approval` middleware — not app |
| UI | `ToolCallPartView.tsx`, `Footer.tsx` |
| Keyboard | `use-agent-keybindings.ts` — `y` approves **one** pending tool per press; `n` enters freeform deny-reason input |
| Deny reason | App collects reason in freeform mode; `respondToToolApproval(id, false, reason)` stores it on `part.approval.reason` and adds a `tool-result` part for the LLM |
| Empty model turn | TanStack may leave a `parts: []` assistant shell after `TEXT_MESSAGE_START` with no content; `AgentUIChannel.finalizeStream()` strips trailing shells; `needsAgentResponseAfterTools()` skips shells when deciding pump continuation |
| Resume | `respondToToolApproval()` — core re-runs while `shouldContinueAgentPump()` (approved execution or model follow-up after denial) |

**Mixed tool batches** (e.g. `tree` + `run_command`): TanStack defers non-approval tools while approvals are pending. Core `pumpToolPhases()` loops `runAgentStream()` until `shouldContinueAgentPump()` is false — no `ChatClient.shouldAutoSend()`.

### 4.4 Client tools (`ask_user`)

Client tools pause the run until the host supplies output via `addToolResult`. Core does **not** infer UI status from message parts — the app sets it explicitly:

| API | When |
|-----|------|
| `ManagedAgent.setClientToolWaiting(true)` | App detects pending `ask_user` (select list or freeform) |
| `ManagedAgent.setClientToolWaiting(false)` | User submits answer, before `addToolResult` |

Status becomes `awaiting_user` (distinct from approval `waiting`). Exposed in CLI via `useAgentChat().setClientToolWaiting`.

**Critical:** `runner.run()` receives **UIMessages** from `AgentChatController` so TanStack `chat()` can extract `part.approval` before conversion.

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

### 5.1 Layer 1 — Tool compact

**Files:** `agent/compaction/tool-compact/`, `agent/middleware/tool-compact-middleware.ts`

Runs **after** context auto-compact in the middleware stack.

- **Recent window** (`keepRecentToolResults`): tools with `toModelOutput` on `defineServerTool` are transformed for the LLM; result cached per `toolCallId` in `ToolCompactCache`
- **Skips** approval placeholders (`pendingExecution: true`) — tool-compact runs on `onConfig` before execution; transforming those messages would strip the marker and TanStack would skip the real tool run
- **Outside window**: `role: "tool"` content replaced with `"[Previous: used {tool_name}]"`; clears tool-output cache + compact cache for that call
- Skips small results (`minToolResultSize`); protects `list_skills`, `load_skill`, `todo`, etc.
- **UI** `UIMessage` history is unchanged; only the LLM `ModelMessage` path is shaped

Large tool outputs at **execute** time still use `maybeCacheOutput` (`.agent-cache/tool-output/`) as a separate fallback — not part of compaction.

### 5.2 Layer 2 — Reasoning strip

**File:** `agent/middleware/compaction-middleware.ts` → `stripReasoningFromHistory`

- **Disabled** — DeepSeek thinking mode requires `reasoning_content` on assistant messages to be echoed on subsequent API calls (especially after tool calls). Stripping `thinking` caused `400` errors.
- Reasoning echo is handled by `models/reasoning-chat-completions-adapter.ts` for DeepSeek endpoints.

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

`AgentContext.getMessagesForLLM(canon)` returns:

```
[summaryMessage, ...canon.slice(compactIndex)]
```

`canon` is rebuilt each `onConfig` via `getCanonicalModelMessages(engine)`:
`convert(uiMessages) + engine.slice(runBaselineCount)`.

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
| **Pump idle (core)** | `AgentChatController.persistMessages` → `maybeSaveSessionUIMessages(..., "pump-complete")` | Model fields **plus** `uiMessages` when fingerprint changed |
| **Stable UI checkpoint (app)** | `useAgentChat` subscribe / status → `maybeSaveSessionUIMessages(..., "checkpoint")` | Same as above; skips during `running`/`thinking`/`responding`/`compacting` |
| **Manual flush** | `saveSessionUIMessages` (`/clear`, slash commands) | Force full persist regardless of streaming |

`SessionSyncTracker` (`agent/session/session-sync-tracker.ts`) fingerprints each `UIMessage` and skips disk writes until a stable checkpoint (new user turn, approval wait, terminal status, or pump complete). Format remains full JSON v2; only write **frequency** is reduced.

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

App passes `initialMessages` from resume into `ManagedAgent.initChat()`.

### 6.4 Context ↔ UI sync rules

**Message flow (expected contract):**

```
uiMessages (source of truth in AgentContext, synced at each `chat()` start)
  → getCanonicalModelMessages(engine) on each onConfig
     · engine.length > runBaseline → UI prefix + engine suffix
     · engine.length === runBaseline → prefer engine (in-place tool results)
     · engine shorter with summary → UI.slice(compactIndex) + engine tail
  → getMessagesForLLM(canon) → LLM view returned to TanStack
```

- **Each run start** (`prepareForRun`): incoming `uiMessages` from `AgentChatController` → `context.setUIMessages` (summary + `compactIndex` preserved).
- **After run idle** (`AgentChatController` after `pumpToolPhases`): `maybeSaveSessionUIMessages(messages, "pump-complete")`.
- **Stable UI checkpoints** (`useAgentChat`): `maybeSaveSessionUIMessages` on throttled message updates and status transitions; skips mid-stream writes.
- **During runs / core**: `persistSession()` and `finalizeRun` write model fields only; they never pass `uiMessages`.
- **Manual `/compact`**: syncs UI → context, compacts LLM path only; UI history stays complete; `persistSession()` saves model state only.
- **Manual `/clear`**: `saveSessionUIMessages()` force-flushes before rotating session.

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
  → emit memory:extract { status: start | complete | empty | skip-short | error }
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
| Tools | `agent:tool-start`, `agent:tool-approval-request`, `agent:tool-end`, `agent:tool-error` |
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
User sends message (AgentChatController.sendMessage)
  │
  ▼
agentManager.runAgentStream(agentId, { messages: UIMessage[], abortSignal })
  │
  ▼
executeManagedAgentRun
  ├─ ensureAgentRunner (lazy build AgentRunner + middleware)
  ├─ prepareForRun
  │    ├─ (user-turn only) memory.prefetchRelevantMemories
  │    └─ (user-turn only) emit prompt:submit
  └─ runStreamWithReactiveCompactRetry
       └─ runner.run → TanStack chat()
            │
            ├─ [each iteration] compaction.onConfig
            │    ├─ stripReasoningFromHistory (DeepSeek)
            │    └─ autoCompact if threshold exceeded
            ├─ tool-compact.onConfig → toModelOutput + recent-window placeholders
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
[app] useAgentChat → maybeSaveSessionUIMessages (checkpoint on stable UI / status)
[core] pump idle → maybeSaveSessionUIMessages(..., "pump-complete")
[core] finalizeRun / /compact → persistSession() (model fields only)
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
pnpm --filter @my-agent/core run validate:tool-phase-utils
pnpm --filter @my-agent/core run validate:session-sync-tracker
pnpm --filter @my-agent/core run validate:tool-resume-sentinel
```

Full package validation: `pnpm build:core` + `pnpm typecheck` (core tools typecheck clean as of recent fixes).
