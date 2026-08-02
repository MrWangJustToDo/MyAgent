## Context

`@my-agent/core` already has a workable three-layer layout:

```
agent/     domain features (tools, compaction, plan, memory, …)
managers/  composition root + orchestration (ManagedAgent, AgentManager, chat, run)
models/    adapters / models.dev / prompt-cache wire helpers
```

A prior organization review correctly flagged naming and `ManagedAgent` surface issues, but understated **layer inversion** (`agent/` importing `managers/`), **misplaced package-wide stream helpers under `subagent/`**, and **dual finalize paths**. This design implements the priority checklist without discarding the top-level split.

Constraints:

- ESM + `.js` imports; file size guideline ~400 lines
- No formal test framework — validation via `pnpm validate:*` + `pnpm build:core`
- User allows breaking/public API removals and renames; **no long-lived shims**
- Related incomplete change `core-structure-convergence` targeted an older Agent/Base merge; this change assumes current `ManagedAgent`-centric tree and does not depend on finishing that archive

## Goals / Non-Goals

**Goals:**

1. One run-completion path for chat and detached/subagent runs
2. Dependency direction: domain does not import orchestration hub
3. Correct module homes for stream helpers, recovery, prompt/cache
4. Smaller curated public export surface; tighter `ManagedAgent` writability
5. Priority-ordered delivery with validate scripts after each wave

**Non-Goals:**

- Rewriting domain algorithms (compaction, memory, plan)
- Splitting `ManagedAgent` into nested state objects
- Renaming `managed-agent.ts` → `agent.ts`
- Preserving deprecated exports

## Decisions

### D1 — Unified `AgentRunOutcome` + `finalizeRun`

**Choice:** Introduce a small outcome type and a single finalize entry used by `AgentChatController` and detached/`runManagedAgent*` paths.

```ts
type AgentRunOutcome = {
  kind: "finished" | "aborted" | "error" | "waiting";
  finishReason?: string | null;
  errorMessage?: string;
};
```

`whenClear` / reconcile strategy is derived from `kind` (and optionally a named policy), not ad-hoc string literals at each call site. `finalizeDetachedRun` becomes a thin wrapper or is inlined away.

**Alternatives:** Keep dual paths with better docs — rejected (drift already observed). Force all runs through `AgentChatController` — rejected (subagents need lighter bridgeUI path).

### D2 — Shared types live below `managers/`

**Choice:** New neutral home (preferred: `packages/core/src/agent/runtime-types/` or `packages/core/src/types/` package-local folder — pick one during implement; avoid root `types.ts` one-liner). Move or re-export:

- `TokenUsage` (from usage-tracker-utils)
- Status unions / active-terminal sets needed by domain
- Event type unions needed by plan/middleware (or keep event bus in managers but pass string unions downward)

Domain modules import the neutral module; `managers` may import domain + neutral. **Forbidden:** new `agent/**` → `managers/**` imports except transitional exceptions documented in tasks and removed by wave end.

**Alternatives:** Invert everything into managers — rejected (managers already too large). Keep duck-typed duplicates — rejected (that's today's pain).

### D3 — Stream helpers leave `subagent/`

**Choice:** Move `stream-errors.ts` and `extract-assistant-text.ts` to `agent/stream/` (new) or `agent/utils/` if stream folder feels thin. Update imports; `subagent/index` may re-export briefly only if needed for in-progress scripts — prefer hard cut.

### D4 — Recovery rename + split

**Choice:**

```
managers/run-stream-recovery.ts          # orchestrator + backoff
managers/stream-recovery/
  reactive-compact.ts
  capability-sanitize.ts
  max-tokens-continue.ts
```

Delete or hard-cut `reactive-compact-retry.ts` name (no shim). Update `run-agent` / validates.

### D5 — Prompt / cache boundary

**Choice:** `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` and cache key helpers owned by `models/prompt-cache.ts` (or `agent/prompt/` if models must stay adapter-only). `managed-agent-prompt.ts` consumes them; middleware consumes models/agent prompt modules — **not** the reverse into managers from models.

### D6 — Public API trim (BREAKING)

**Choice:** Remove from `src/index.ts` symbols only used by `ManagedAgent` + `dev.ts`/validates (session-sync helpers, tool-phase pump helpers, etc.). Keep them on `dev.ts` for validates. Document removed list in tasks + ARCHITECTURE.

### D7 — File renames

**Choice:** `manager-agent.ts` → `agent-manager.ts`. Keep `managed-agent.ts`. Update barrels and docs.

### D8 — `RunLifecycleHost`

**Choice:** Prefer `import type { ManagedAgent }` in helpers, or `Pick<ManagedAgent, …>` defined next to helpers. Drop hand-maintained parallel interface fields.

### D9 — `ManagedAgent` field tightening (BREAKING, staged)

**Choice (order):**

1. Private: `runner`, `textAdapter`, `runnerConfigKey` + package-internal accessors used by `run-agent` / chat
2. Readonly/getter: `ui`, `status`, `context`, `usage` where hosts only read
3. Leave intentional mutables (`tools`, plan/autoApprove controllers) public until a later change

### D10 — Plan placement rule

**Choice:** Document: domain logic stays in `agent/plan/`; tool factories stay under `agent/tools/` (consistent with skills). Optional later move of create-plan tools into `plan/` only if it reduces confusion — not required for wave success.

### D11 — Validation strategy

**Choice:** Per-wave `validate:*` scripts where behavior is assertable (finalize policies, import-boundary grep or lightweight script, public export snapshot). Always `pnpm build:core` after each wave; full `pnpm lint`/`pnpm format`/`pnpm build` before change considered done.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking host imports of trimmed APIs | Grep workspace for symbol usage before removal; fix hosts in same PR |
| Layering move causes large diff noise | Do L1/L2 as dedicated commits/tasks before field privacy |
| Status reconcile regressions in subagents | Expand validate covering detached finalize kinds |
| Overlap with stale `core-structure-convergence` | Do not resume that change; archive or supersede separately |
| 400-line splits distract from P0 | Keep F1 as P2; only split when touching those files |

## Migration Plan

1. Implement P0 (A1, L2, L1) → validate + build:core  
2. P1 (A2, prompt/cache, API1) → validate + build:core; fix host compile errors  
3. P2 (rename, Pick, ManagedAgent privacy, selective file splits) → validate + build:core  
4. P3 optional cleanup  
5. Update `ARCHITECTURE.md` / `AGENTS.md`  
6. Final `pnpm format`, `pnpm lint`, `pnpm build`

Rollback: revert PR; no data/format migration.

## Open Questions

1. Neutral types folder name: `src/runtime-types/` vs `agent/runtime-types/` vs expand `environment/` — **default during apply: `packages/core/src/runtime-types/`** (sibling to agent/managers, clearly shared).
2. Whether `AgentEventBus` stays in managers while only `AgentEventType` moves — **default: move type union to runtime-types; bus class stays in managers**.
3. Exact export removal list — finalize during API1 by grepping `index.ts` consumers outside core.
