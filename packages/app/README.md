# @my-agent/app

Shared UI layer (CLI + extension). Agent control is **Session-only**: hooks, layout, and slash commands use `AgentSession` / `AgentSessionHost`, not `ManagedAgent` / `agentManager`.

## `@my-agent/core` import allowlist

### Allowed (session-safe / presentation / CoreEnv)

| Category | Examples |
|----------|----------|
| Session API | `AgentSession`, `AgentSessionHost`, snapshots, commands, channel types |
| Serializable types | `AgentStatus`, `AgentMode`, `TodoItem`, `TokenUsage`, `LogEntry`, `PlanModeState`, `SessionMeta`, tool output types, `ExtensionInfo`, `AgentEvent` (typed envelope) |
| Status helpers | `isActiveStatus` |
| Presentation registry | `getToUI` / `registerToUI` / `clearToUI` (tools register in core; UI looks up) |
| CoreEnv plane | `getEnv`, `hasCoreEnv`, `FileEntry`, … (workspace panels only) |
| Model constants | `DEFAULT_BASE_URLS`, `DEFAULT_LOCAL_OPENAI_BASE_URL`, `ModelStyle` / `ModelInfo` types |
| Summary stream protocol | `summaryStreamKey`, display-window helpers, `SummaryStreamEvent` types |
| Edit preview (CoreEnv) | `previewEdit` (workspace read; no ManagedAgent) |

### Allowed only in Local adapter bootstrap

| Symbol | File |
|--------|------|
| `agentManager`, `createLocalAgentSessionHost`, `resolveModelConfigFromProvider`, `buildDefaultSystemPrompt` | `adapter/create-agent.ts` |
| `buildDefaultSystemPrompt` | `hooks/use-config.ts` (default prompt fill) |

HTTP Host bootstrap (`createHttpAgentSessionHost`) replaces the Local exception when `--agent-remote` lands (§5).

### Forbidden in app UI / commands / hooks (except bootstrap files above)

- `ManagedAgent`, `agentManager`, `createManagedAgent`, `AgentManager`
- Live `TodoManager` / `AgentLog` class instances (use Session snapshot / `log` channel)
- `SessionStore` (use `session.dispatch({ type: "session.list" })` / Host catalog)
- Compaction executors: `autoCompact`, `applyCompactionResult`, `estimateTokens` (not on public core entry; run via `dispatch({ type: "compact" })`)
- Live classes: `TodoManager`, `AgentLog`, `SessionStore` (not on public core entry; use Session snapshot / commands)
- Side-LLM / managed runners: `runSideTextQuery`, `resolveTextAdapterForManaged`
- Runtime extension loaders: `ExtensionRunner`, `ExtensionLoader` (observe via Session `extensions` snapshot)

Pure presentation helpers that used to come from core live under `src/utils/` (`compaction-summary.ts`, `plan-footer-label.ts`).

## Validate

```bash
pnpm --filter @my-agent/app run validate:core-imports
pnpm --filter @my-agent/app run validate:presentation-helpers
pnpm --filter @my-agent/app run validate:session-only-smoke
pnpm --filter @my-agent/app test
```

### Manual Local CLI checklist (3.7)

With `pnpm start:cli` in a real workspace:

1. Chat: send a message, confirm streaming reply
2. `/plan` → plan mode footer; write/save plan; `/plan execute` if ready
3. `/compact` after enough context
4. Spawn a `task` subagent → `Ctrl+T` panel lists child + preview
5. Start with resume picker (`--resume` / picker mode) → list via Session, resume one session
