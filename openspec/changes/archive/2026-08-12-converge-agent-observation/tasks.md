## 1. Streaming scope (core)

- [x] 1.1 Refactor `streaming-callback.ts` to store subscribers per `agentId` (required; no global fan-in)
- [x] 1.2 Thread `agentId` into emit sites (`emitStreamingChunk` / clear) from tool run context
- [x] 1.3 Add `validate:streaming-scope` covering two-agent isolation
- [x] 1.4 Export any new types/options from `index.ts` / `dev.ts` as needed

## 2. Observe facade (core)

- [x] 2.1 Add `managed-agent-observe.ts` with `AgentObserveHandlers` and `observeManagedAgent(...)` helper
- [x] 2.2 Wire `ManagedAgent.observe()`; ensure single unsubscribe is idempotent
- [x] 2.3 Implement event filter: same `agentId`, plus `subagent:*` when `parentId` matches
- [x] 2.4 Hook streaming + optional `AgentUIChannel` / log subscriptions when handlers provided
- [x] 2.5 Export observe types from `@my-agent/core`; add `validate:agent-observe`

## 3. App migration

- [x] 3.1 Migrate `use-streaming-output` to `observe({ onStreaming })` (agent-scoped)
- [x] 3.2 Migrate `use-agent-chat` + `Footer` state ticks to `observe({ onState })`
- [x] 3.3 Migrate `use-agent-usage` to `observe({ onEvent })` (or shared helper)
- [x] 3.4 Migrate subagent hooks / `SubagentPanel` / `use-task` to observe (`onEvent` / `onMessages`; no raw `ui.subscribe`)

## 4. Split ManagedAgent

- [x] 4.1 Extract session persist/restore helpers to `managed-agent-session.ts`
- [x] 4.2 Extract prepare/finalize/abort lifecycle to `managed-agent-run-lifecycle.ts`
- [x] 4.3 Extract reactive compact to `managed-agent-compact.ts`
- [x] 4.4 Keep `managed-agent.ts` as composition root; public API unchanged; aim ≤400 lines per file where practical

## 5. Docs and verify

- [x] 5.1 Update `ARCHITECTURE.md` §8: recommend `observe()`, map handlers to L1–L3, require agent-scoped streaming
- [x] 5.2 Run new validates + `pnpm lint`, `pnpm format`, `pnpm build:core` (and `pnpm build:app` if app migrated)

## 6. Tighten public observation surface

- [x] 6.1 Remove streaming subscribe helpers from `@my-agent/core` public exports (keep on `dev.ts` for validates)
- [x] 6.2 Make `ManagedAgent.subscribeState` private; hosts use `observe({ onState })` only
- [x] 6.3 Document `agentManager.on` as advanced cross-agent / `"*"` bus API
- [x] 6.4 Update ARCHITECTURE + change specs for the narrowed surface
