# Tasks: Middleware Phase Pipeline

## 1. Characterization

- [x] 1.1 Capture the current middleware array order as a canonical name list; add order-snapshot validation script `validate-middleware-order.mjs` (green against current code)
- [x] 1.2 Verify `ChatMiddleware` accepts extra fields / determine the wrapper shape; document the finding in the design note if it deviates from D1 — resolved: 0.53's `ChatMiddleware` is structurally open; `defineMiddleware(phase, mw)` spread wrapper keeps it assignable, and phase on the param preserves hook contextual typing

## 2. Phase declarations

- [x] 2.1 Add `MiddlewarePhase` type + rank map + `defineMiddleware` helper (or wrapper) in `managers/middleware/`
- [x] 2.2 Declare phases on all 12 middleware factories: observe (status, approval-resume, lifecycle), context-transform (compaction, tool-compact, turn-context), tools (extensions, early-tool-result-ui, task-prefork, plan-mode, background-notification), wire-annotate (prompt-cache)

## 3. Phase-sorted assembly

- [x] 3.1 `buildAgentRunner` sorts by phase rank (stable within phase); dev-warn on undeclared phase; `assertCanonicalMiddlewareOrder` warns on drift from `CANONICAL_MIDDLEWARE_ORDER`
- [x] 3.2 Snapshot stays green: sorted order === historical array order; remove comment-only ordering notes in `run-agent.ts`

## 4. Validation

- [x] 4.1 `pnpm typecheck` and `pnpm build:core` pass; lint/format changed files
- [x] 4.2 Related validate suites green (middleware-order, run-agent-skeleton, agent-run-finalization, task-prefork, run-abort-ownership, task-run-state)
