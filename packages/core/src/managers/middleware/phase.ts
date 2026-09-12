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

/**
 * Stable sort by phase rank. Middlewares without a declared phase keep their
 * relative position (rank fallback) and surface a dev warning — an undeclared
 * phase is an assembly-contract violation caught by the order snapshot too.
 */
export type { ChatMiddleware } from "@tanstack/ai";

/**
 * Canonical name sequence of the managed middleware pipeline. The phase sort
 * must resolve to exactly this order; `assertCanonicalMiddlewareOrder` warns
 * on divergence and `validate:middleware-order` fails the build on drift.
 */
export const CANONICAL_MIDDLEWARE_ORDER = [
  "status",
  "approval-resume",
  "lifecycle",
  "compaction",
  "tool-compact",
  "turn-context",
  "extensions",
  "early-tool-result-ui",
  "task-prefork",
  "plan-mode",
  "background-notification",
  "prompt-cache",
] as const;

/** Dev-time guard: warn when the assembled pipeline diverges from the canonical snapshot. */
export function assertCanonicalMiddlewareOrder<T extends { name?: string }>(
  middlewares: T[],
  warn: (message: string) => void
): void {
  const names = middlewares.map((m) => m.name ?? "?");
  for (let i = 0; i < Math.max(names.length, CANONICAL_MIDDLEWARE_ORDER.length); i++) {
    const actual = names[i];
    const expected = CANONICAL_MIDDLEWARE_ORDER[i];
    if (actual !== expected) {
      warn(
        `middleware order drift at position ${i}: expected "${expected ?? "(none)"}", got "${actual ?? "(none)"}". ` +
          "Update the phase declarations or CANONICAL_MIDDLEWARE_ORDER, and refresh validate:middleware-order."
      );
      return;
    }
  }
}

/**
 * Stable sort by phase rank. Middlewares without a declared phase keep their
 * relative position (rank fallback) and surface a dev warning — an undeclared
 * phase is an assembly-contract violation caught by the order snapshot too.
 */
export function sortMiddlewaresByPhase<T extends { name?: string; phase?: MiddlewarePhase }>(
  middlewares: T[],
  warn: (message: string) => void = () => {}
): T[] {
  return [...middlewares].sort((a, b) => {
    const rankA = a.phase ? MIDDLEWARE_PHASE_RANK[a.phase] : Number.NaN;
    const rankB = b.phase ? MIDDLEWARE_PHASE_RANK[b.phase] : Number.NaN;
    if (Number.isNaN(rankA)) {
      warn(`middleware "${a.name ?? "?"}" has no phase declaration — it will not be phase-sorted`);
    }
    if (Number.isNaN(rankB)) {
      warn(`middleware "${b.name ?? "?"}" has no phase declaration — it will not be phase-sorted`);
    }
    const left = Number.isNaN(rankA) ? Number.MAX_SAFE_INTEGER : rankA;
    const right = Number.isNaN(rankB) ? Number.MAX_SAFE_INTEGER : rankB;
    return left - right;
  });
}
