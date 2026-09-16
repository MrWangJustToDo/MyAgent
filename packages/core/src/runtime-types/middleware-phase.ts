/**
 * Middleware phase primitives shared across layers.
 *
 * These live in `runtime-types/` (not `managers/`) so domain modules — notably
 * `agent/plan/plan-mode-middleware.ts` — can declare their phase without
 * importing `managers/**`, which the `agent→managers` boundary forbids (see
 * `validate:agent-managers-boundary`). Same rationale as `agent-limits.ts`.
 *
 * Pipeline *assembly* concerns (the canonical order snapshot, the phase sort,
 * the order assertion) stay in `managers/middleware/phase.ts`: they describe how
 * the manager layer builds the run, not what a middleware declares about itself.
 */

import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

/**
 * Declared pipeline phase for an agent-run middleware. `buildAgentRunner`
 * sorts middlewares by phase rank (stable within a phase), so "where does a
 * new middleware go" is answered by the declaration, not by comment-only
 * ordering notes.
 *
 * - `observe`: sees the run as-is (status, lifecycle accounting, approval resume).
 * - `context-transform`: rewrites the message chain before tools/model (compaction,
 *   tool-compact, turn-context). Order within the phase is dependency-sensitive —
 *   guarded by the canonical order snapshot (`CANONICAL_MIDDLEWARE_ORDER`).
 * - `tools`: tool-phase behaviors (extension interception, UI mirroring, prefork,
 *   plan-mode filtering, background notifications).
 * - `wire-annotate`: annotates the final wire payload (prompt-cache must be last
 *   so its key covers the fully transformed messages).
 */
export type MiddlewarePhase = "observe" | "context-transform" | "tools" | "wire-annotate";

export const MIDDLEWARE_PHASE_RANK: Record<MiddlewarePhase, number> = {
  observe: 0,
  "context-transform": 1,
  tools: 2,
  "wire-annotate": 3,
};

export type PhasedChatMiddleware<TContext = unknown> = ChatMiddleware<TContext> & {
  phase: MiddlewarePhase;
};

// ============================================================================
// Declaration helper
// ============================================================================

/**
 * Attach a phase declaration to a middleware. ChatMiddleware is structurally
 * open, so the returned object remains assignable wherever the plain
 * middleware is accepted.
 */
export function defineMiddleware<TContext = unknown>(
  phase: MiddlewarePhase,
  middleware: ChatMiddleware<TContext>
): ChatMiddleware<TContext> & { phase: MiddlewarePhase } {
  return { ...middleware, phase };
}
