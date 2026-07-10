## Phase A — Merge logic onto ManagedAgent (core, app-compatible)

- [x] A.1 Create `packages/core/src/managers/agent-types.ts` — move `AgentConfig`, `AgentStatus`, `AgentRunOptions` from `loop/types.ts`
- [x] A.2 Create `packages/core/src/managers/managed-agent-prompt.ts` + `managed-agent.ts` — extract from `Base.ts` / `Agent.ts`
- [x] A.3 Define `ServiceDeps` interface; update `MemoryService` and `SessionService` to use it (remove `AgentLoopHost`)
- [x] A.4 Update `ManagedAgentState` constructor to accept `ServiceDepsProvider`
- [x] A.5 `ManagedAgent` class implements all former `Agent`/`Base` methods
- [x] A.6 `AgentManager.createManagedAgent()` builds `ManagedAgent` directly (no separate `Agent` instance)
- [x] A.7 `export { ManagedAgent as Agent }` — app `import type { Agent }` unchanged
- [x] B.10 Slim `agent-context`: conversation-only `AgentContext`; usage/pricing on `UsageTracker`
- [x] B.11 Migrate usage callers to `agent.usage`; remove usage delegators from `AgentContext`
- [ ] A.8 Run CLI smoke chat (manual)

## Phase B — Delete legacy classes and slim pipeline

- [x] B.1 Introduce `AgentRunDeps` in `packages/core/src/managers/agent-run-deps.ts`
- [x] B.2 Refactor `buildAgentRunner()` to build `AgentRunDeps` once
- [x] B.3 `reactive-compact-retry.ts` uses `ManagedAgent` directly
- [x] B.4 Fix `ensureAgentRunner` — cache runner via `runnerConfigKey`
- [x] B.5 Remove `ManagedAgent.agent` field and `ManagedAgentTarget` type
- [x] B.6 Delete `Agent.ts`, `Base.ts`, `agent-loop-host.ts`, `loop/types.ts`, `loop/memory-service.ts`, `loop/session-service.ts`
- [x] B.7 Move services to `managers/memory-service.ts`, `managers/session-service.ts`
- [x] B.8 Update exports in `agent/loop/index.ts`, `managers/index.ts`
- [x] B.9 Run `pnpm build`, `pnpm lint`

## Phase C — App type cleanup

- [x] C.1 Replace `import type { Agent }` with `ManagedAgent` in app (12 files), cli, extension
- [x] C.2 Remove `export type Agent = ManagedAgent` alias from core
- [x] C.3 Update slash commands that use `agent.status =` to use `managed.status` or setter on `ManagedAgent`
- [x] C.4 Update `InitResult.agent` type in `packages/app/src/adapter/types.ts`
- [x] C.5 Run `pnpm build:app`, `pnpm build:cli`, `pnpm build:extension`

## Phase D — Documentation and cleanup

- [~] D.1 Update `AGENTS.md` architecture diagram (remove Agent/Base layer)
- [~] D.2 Update `CLAUDE.md` quick reference
- [ ] D.3 Mark TanStack `tasks.md` items 10.2 as superseded by this change
- [ ] D.4 Remove stale comments referencing `Agent`, `Base`, `prepareStep`, `AgentLoopHost`

## Validation checklist

- [x] V.1 `rg 'AgentLoopHost|extends Base|attachManagedState' packages/core` → zero matches
- [x] V.2 `rg 'from \"./loop/Agent|from \"./loop/Base' packages` → zero matches
- [ ] V.3 CLI: send message, tool call, `run_command` approval
- [ ] V.4 CLI: `/compact`, `/clear`, `/rename`, session resume
- [ ] V.5 Subagent `task` tool with preview panel
- [ ] V.6 Reactive compact: artificially trigger `prompt_too_long` or unit test `handleReactiveCompact` path

## Phase E — Architecture debt (see tracker)

Full inventory: [architecture-debt-tracker.md](./architecture-debt-tracker.md)

- [x] E.1 P0: Fix `webfetch` `.agent` abort controller bug
- [x] E.2 P1: Unify compaction paths (reactive → `applyCompactionResult`, single `shouldAutoCompact`)
- [x] E.3 P1: Event/hook cleanup (dead types, single hook channel)
- [x] E.4 P1: `SessionService.restoreFromStore()` — move logic from `AgentManager.resumeSession`
- [x] E.5 P1: Split `ManagedAgent` / extract `AgentFactory`
- [x] E.6 P1: Subagent — implement or remove unused `SubagentConfig` fields; inject manager deps
- [x] E.7 P2: Remove `agentManager` singleton from tools/subagent (webfetch/websearch use injected `managed`)
- [x] E.8 P2: Consolidate deps (`buildManagedAgentDeps` unifies ServiceDeps + AgentRunDeps)
- [x] E.9 P2–P3: loop shim rename, export layering, dead code (`sessionCacheHitTokens`, deprecated aliases)

## Suggested PR split

| PR | Scope | Risk |
|----|-------|------|
| PR1 | Phase A (merge + ServiceDeps + shim) | Medium — core only |
| PR2 | Phase B (delete Agent/Base + AgentRunDeps + runner cache) | High — verify all validate scripts |
| PR3 | Phase C + D (app types + docs) | Low |
