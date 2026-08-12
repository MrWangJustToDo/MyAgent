## 1. P0 — Unified run finalization (A1)

- [x] 1.1 Define `AgentRunOutcome` (and any named reconcile policy mapping) in a core managers or runtime-types module
- [x] 1.2 Implement shared `finalizeRun(managed, outcome)` (or equivalent) that owns status reconcile + existing finalize side-effects
- [x] 1.3 Wire `AgentChatController` pump / stop / error paths to the shared entry; remove divergent ad-hoc reconcile literals where possible
- [x] 1.4 Wire detached / `runManagedAgent*` / subagent completion to the same entry; collapse `finalizeDetachedRun` to a thin wrapper or delete it
- [x] 1.5 Add `validate:agent-run-finalization` (or similar) covering at least finished + waiting/aborted outcomes; register script in `packages/core/package.json` and export any needed helpers from `dev.ts`
- [x] 1.6 Run `pnpm --filter @my-agent/core run validate:agent-run-finalization` and `pnpm build:core`

## 2. P0 — Move package-wide stream helpers (L2)

- [x] 2.1 Create `agent/stream/` (or agreed home) and move `stream-errors.ts` + `extract-assistant-text.ts` out of `subagent/`
- [x] 2.2 Update all imports (chat controller, UI channel, recovery, subagent, validates); hard-cut old paths (no long-lived shim)
- [x] 2.3 Update `subagent/index.ts` / docs if they re-exported these helpers
- [x] 2.4 Run affected validates (`validate:stream-errors`, `validate:extract-assistant-text`, `validate:agent-ui-channel` as applicable) and `pnpm build:core`

## 3. P0 — Neutral types + break agent→managers imports (L1)

- [x] 3.1 Create `packages/core/src/runtime-types/` (per design default) for shared `TokenUsage`, status unions/helpers needed by domain, and `AgentEventType` (or equivalent)
- [x] 3.2 Move or re-home types; update `managers` and `agent` imports to consume runtime-types
- [x] 3.3 Eliminate remaining `agent/**` → `managers/**` imports (grep gate); fix middleware/plan/compaction/memory/session/tools as needed
- [x] 3.4 Add a lightweight validate or scripted grep check documenting zero `agent→managers` imports; run `pnpm build:core`

## 4. P1 — Split and rename stream recovery (A2)

- [x] 4.1 Introduce `run-stream-recovery.ts` orchestrator + strategy modules (`reactive-compact`, `capability-sanitize`, `max-tokens-continue`)
- [x] 4.2 Migrate callers from `reactive-compact-retry.ts`; delete old primary file (no shim)
- [x] 4.3 Update validates (`validate:reactive-compact`, related) and `dev.ts` exports
- [x] 4.4 Run recovery-related validates and `pnpm build:core`

## 5. P1 — Prompt / cache boundary

- [x] 5.1 Move `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` / cache ownership so `models/prompt-cache` (or agent prompt module) does not import `managers`
- [x] 5.2 Update `managed-agent-prompt`, turn-context / prompt-cache middleware imports
- [x] 5.3 Grep-confirm zero `models/**` → `managers/**` imports; run `validate:prompt-cache` (and related) + `pnpm build:core`

## 6. P1 — Trim public API (BREAKING)

- [x] 6.1 Grep workspace for public `index.ts` exports used only inside core/validates (session-sync helpers, tool-phase helpers, etc.)
- [x] 6.2 Remove those exports from `src/index.ts`; keep on `dev.ts` as needed; fix validates/hosts
- [x] 6.3 Record explicit removal list in this change’s notes or `ARCHITECTURE.md`
- [x] 6.4 Run `pnpm build:core` and host package typechecks as needed (`build:app` if hosts break)

## 7. P2 — Naming and RunLifecycleHost

- [x] 7.1 Rename `manager-agent.ts` → `agent-manager.ts`; update all imports, barrels, docs
- [x] 7.2 Replace hand-maintained `RunLifecycleHost` field list with `Pick<ManagedAgent, …>` or `import type { ManagedAgent }`
- [x] 7.3 Run `pnpm build:core`

## 8. P2 — Tighten ManagedAgent surface (BREAKING)

- [x] 8.1 Make wiring fields private (`runner`, `textAdapter`, `runnerConfigKey`) with package-internal accessors used by `run-agent` / chat
- [x] 8.2 Expose observable fields as readonly/getters where hosts only read (`ui`, status/context/usage as applicable)
- [x] 8.3 Document tightened fields; fix any remaining assignments in repo
- [x] 8.4 Run `pnpm build:core` (+ host builds if required)

## 9. P2 — Selective size / plan convention

- [x] 9.1 Split or extract only when touching oversized files (`event-log-bridge` rules table, `plan-mode-controller`, `agent-chat-controller`, memory modules) to stay near 400-line guideline
- [x] 9.2 Document plan domain (`agent/plan/`) vs tool factories (`agent/tools/`) convention in `ARCHITECTURE.md`

## 10. P3 — Optional cleanup (do if cheap while nearby)

- [x] 10.1 Optional: `agent/utils` / `approval` barrels, vestigial root `types.ts`, minor text-extract helper dedupe — deleted vestigial root `types.ts` (skipped: barrels / text-extract dedupe)
- [x] 10.2 Optional: small status-type consolidations without forcing a single mega types file (skipped: already covered by runtime-types in P0)

## 11. Docs and final gate

- [x] 11.1 Update `packages/core/ARCHITECTURE.md` middleware/layering/finalize/public-API notes to match implementation
- [x] 11.2 Update `AGENTS.md` only where public contracts or paths changed
- [x] 11.3 Run `pnpm format`, `pnpm lint`, and `pnpm build` (or at least affected package builds: core → app if hosts changed) — format + full `pnpm build` OK; lint fails on missing `@typescript-eslint/utils` (pre-existing env issue)
- [x] 11.4 Confirm all new/updated `validate:*` scripts used in this change pass
