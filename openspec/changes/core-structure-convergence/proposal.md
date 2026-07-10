## Why

TanStack migration (Phases 1–10) replaced the Vercel runtime (`streamText`, `tool()`, `LanguageModel`) but **did not finish the structural refactor** promised in the original design. The agent loop is gone, yet the old object graph remains:

- `Agent` + `Base` (~690 lines) still hold session, memory, compaction, hooks, MCP, skills, and abort logic
- `ManagedAgent` duplicates `context`, `status`, and service access with `Agent` and `ManagedAgentState`
- `AgentLoopHost` exists only to wire `MemoryService` / `SessionService` back to `Agent`
- `buildAgentRunner` passes 10+ getter callbacks into middleware instead of a single run context
- Migration leftovers: `ManagedAgentTarget`, `bridgeUI`, outer `reactive-compact-retry`, runner rebuilt every run

**Result:** fewer Vercel deps, similar complexity. The refactor feels like a runtime swap, not an architecture improvement.

## What Changes

- **Merge `Agent` + `Base` into `ManagedAgent`** — one runtime object per agent; delete `Agent.ts`, `Base.ts`, `AgentLoopHost`
- **Direct dependency injection** for `MemoryService` / `SessionService` (no `() => agent` host indirection)
- **Introduce `AgentRunDeps`** — single object passed to middleware factory and run pipeline (replaces scattered getters)
- **Collapse run pipeline** — `run-agent.ts` + `reactive-compact-retry.ts` become one `ManagedAgent.run()` path
- **Cache `AgentRunner`** — rebuild only when tools, adapter, or agent config change
- **Remove migration types** — `ManagedAgentTarget`, deprecated `RunAgentInput` alias (optional, staged)
- **Public API shift (BREAKING, staged):** app/cli continue to receive a handle from `createManagedAgent()`, but type becomes `ManagedAgent` (or thin `AgentHandle` facade) instead of `Agent`

## Capabilities

### New Capabilities

- `managed-agent-runtime`: `ManagedAgent` owns config, context, services, and run orchestration; no separate `Agent` class
- `agent-run-deps`: Shared run-time dependencies for middleware and compaction (single injection point)

### Modified Capabilities

- `managed-agent`: Spec updated — `agent: Agent` field removed; all former `Agent` methods live on `ManagedAgent`
- `agent-runner`: Unchanged responsibility; wired from `ManagedAgent` with cached instance

## Impact

| Area | Change |
|------|--------|
| `packages/core` | Delete `loop/Agent.ts`, `loop/Base.ts`, `loop/agent-loop-host.ts`; shrink `manager-agent.ts`, `run-agent.ts` |
| `packages/app` | ~12 files: `Agent` type → `ManagedAgent` or `AgentHandle`; method calls unchanged if facade provided |
| `packages/cli` | `local-adapter.ts` type update |
| `packages/extension` | `extension-adapter.ts` type update |
| Behavior | No intentional user-visible behavior change |
| Docs | `AGENTS.md` architecture diagram simplified |

## Non-Goals

- Rewriting compaction algorithms
- Extension remote SSE transport (TanStack Phase 8)
- Session file format decision (TanStack Phase 9)
- Removing `ai-sdk-ollama` bridge (separate follow-up)
- Merging `AgentContext` into `ManagedAgent` (possible later; out of scope for first pass)

## Success Criteria

1. `Agent.ts`, `Base.ts`, `AgentLoopHost` deleted — zero references in core
2. `ManagedAgent` is the only agent instance type inside `AgentManager`
3. `buildAgentRunner` deps fit in one `AgentRunDeps` object (≤ 8 fields)
4. Line count: `manager-agent.ts` + `run-agent.ts` + former `Agent`/`Base` **net reduction ≥ 400 lines**
5. `pnpm build`, `pnpm lint`, existing `validate:*` scripts pass
6. CLI smoke: chat, `/compact`, `/clear`, session resume, subagent task
