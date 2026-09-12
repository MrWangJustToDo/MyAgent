# Design: Middleware Phase Pipeline

## Context

12 middlewares assembled in `buildAgentRunner` (`managers/run-agent.ts:126-214`). Current order and their responsibility buckets:

| # | Middleware | Hook focus | Proposed phase |
|---|---|---|---|
| 1 | status | onChunk/onFinish/onAbort (observe) | `observe` |
| 2 | approval-resume | onConfig (resume tool state) | `observe` |
| 3 | lifecycle | onChunk/onFinish (usage/iteration) | `observe` |
| 4 | compaction | messages transform (auto-compact) | `context-transform` |
| 5 | tool-compact | messages transform (wire tool output) | `context-transform` |
| 6 | turn-context | messages transform (`<ctx>` injection) | `context-transform` |
| 7 | extensions | onBefore/onAfterToolCall (can deny) | `tools` |
| 8 | early-tool-result-ui | onAfterToolCall (UI mirror) | `tools` |
| 9 | task-prefork | onChunk/onFinish (prefork tasks) | `tools` |
| 10 | plan-mode | tool filtering | `tools` |
| 11 | background-notification | onConfig (inject before LLM call) | `tools` |
| 12 | prompt-cache | onConfig (cache key on final payload) | `wire-annotate` |

Ordering constraints that exist today as comments:
- prompt-cache last ("After turn-context / tool filtering so breakpoints see the final wire payload", `run-agent.ts:209`).
- compaction → tool-compact → turn-context form a dependent message-transform chain.
- status first so it observes everything; lifecycle before transformers (iteration accounting).

Constraint: the assembled order MUST be identical to the current array (zero behavior change). TanStack applies middlewares in array order for every hook, so one phase per middleware suffices.

## Goals / Non-Goals

**Goals:**
- Phase declarations answer "where does a new middleware go" at the type level.
- Assembly sorts by phase; a snapshot validation locks the exact sequence.
- Undeclared phase = dev warning + snapshot failure.

**Non-Goals:**
- Changing any middleware's runtime behavior or hook logic.
- Fine-grained within-phase reordering (stable declaration order is kept).
- Topological `before/after` constraint language (overkill today; revisit if within-phase dependencies appear).

## Decisions

### D1: Four-phase vocabulary, declared on the middleware object

- `export type MiddlewarePhase = "observe" | "context-transform" | "tools" | "wire-annotate";` plus `const MIDDLEWARE_PHASE_RANK: Record<MiddlewarePhase, number>`.
- Each factory returns its middleware with a `phase` field (intersection type `ChatMiddleware<T> & { phase: MiddlewarePhase }`; an exported `defineMiddleware(name, phase, middleware)` helper keeps it ergonomic). ChatMiddleware allows extra fields or the helper wraps it — verify against TanStack's type (if `ChatMiddleware` is a closed type, wrap as `{ ...mw, phase }` object spread at the factory boundary).
- `buildAgentRunner` maps entries through `defineMiddleware`, sorts by rank (stable), and dev-warns on any entry lacking a phase.
- **Why phases over topological constraints?** The 12 middlewares fall cleanly into four responsibility buckets that exactly reproduce the current order; phases are self-documenting for new middlewares, whereas pairwise constraints add ceremony without current need.

### D2: Snapshot validation locks the exact sequence

- `validate-middleware-order.mjs` builds the pipeline (via the dev export of `buildAgentRunner`'s assembly step — export a pure `assembleMiddlewarePipeline(managed-shaped deps)` if needed, or snapshot the phase-sorted name list from a factory-level test) and asserts the name sequence against a checked-in canonical list. Any reorder or undeclared-phase addition fails with the divergent position.
- **Why a snapshot in addition to phases?** Phases guarantee the bucket order but not intra-bucket arrangement; the snapshot catches intra-bucket drift (e.g. swapping compaction/tool-compact) that phases intentionally don't police.

### D3: Assembly must remain zero-behavior-change

- Characterization first: capture the current array order (name list) in the snapshot before touching `buildAgentRunner`; after sorting, the two sequences must be identical. Any divergence blocks the change.

## Risks / Trade-offs

- [`ChatMiddleware` type may not accept extra fields] → Use object spread wrapper at factory return; TS structural typing keeps `chat()` compatible (verify with typecheck).
- [Phase buckets hide future intra-bucket dependencies] → Snapshot validation still pins the exact sequence; escalate to constraint language only when a real case appears.
- [Dev warning noise for intentionally-unphased ad-hoc middlewares] → Warning only fires in `buildAgentRunner` (managed pipeline); ad-hoc `AgentRunner` users pass arrays directly and are unaffected.

## Migration Plan

1. Land the order snapshot (characterization, green).
2. Add phase declarations to the 12 factories + `defineMiddleware` helper.
3. Switch `buildAgentRunner` to phase-sorted assembly; snapshot must stay green.
4. Remove comment-only ordering notes; wire `validate:middleware-order` into package.json.

Rollback: steps 2–3 are a single revert; snapshot stays valid either way.

## Open Questions

- Where plan-mode middleware lives (`agent/plan/...`?) — confirm its factory location during implementation; it joins the `tools` phase regardless.
