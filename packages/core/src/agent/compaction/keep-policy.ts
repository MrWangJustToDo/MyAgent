/**
 * Keep policy resolution for compaction.
 *
 * The kept window after compaction is decided by a token budget
 * (`keepRecentTokens`) instead of a fixed count of user turns. When the budget
 * is not explicitly configured and the model's context window is known, it is
 * derived as a bounded fraction of that window. When no context window is
 * known, the system falls back to legacy `keepRecentFlows` turn counting.
 */

import { DEFAULT_COMPACTION_CONFIG } from "./types.js";

import type { CompactionConfig } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Fraction of the model context window kept after compaction (opencode-style). */
export const KEEP_RECENT_WINDOW_RATIO = 0.25;

/** Upper bound for the derived keep budget. */
export const KEEP_RECENT_WINDOW_CAP = 32_000;

/** Lower bound so tiny-window models still retain a usable working set. */
export const KEEP_RECENT_WINDOW_MIN = 4_000;

/** Tokens reserved for the summary + next turn when deriving thresholds. */
export const DEFAULT_RESERVE_TOKENS = 16_384;

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved keep policy for one agent.
 *
 * - `tokens`: keep the most recent messages whose estimated tokens fit in
 *   {@link KeepPolicy.keepRecentTokens} (pairing-safe boundaries).
 * - `turns`: legacy behavior — keep the last {@link KeepPolicy.keepRecentFlows}
 *   real user turns. Used only when no context window is known and no explicit
 *   `keepRecentTokens` is configured.
 */
export interface KeepPolicy {
  kind: "tokens" | "turns";
  keepRecentTokens?: number;
  keepRecentFlows?: number;
}

// ============================================================================
// Public API
// ============================================================================

/** Effective reserve tokens for window-relative derivation. */
export function resolveReserveTokens(config?: Partial<CompactionConfig>): number {
  return config?.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
}

/**
 * Derive a keep budget from the model context window.
 */
export function deriveKeepRecentTokens(contextWindow: number, reserveTokens = DEFAULT_RESERVE_TOKENS): number {
  const usable = Math.max(0, contextWindow - reserveTokens);
  if (usable <= 0) return KEEP_RECENT_WINDOW_MIN;
  return Math.min(
    KEEP_RECENT_WINDOW_CAP,
    Math.max(KEEP_RECENT_WINDOW_MIN, Math.floor(usable * KEEP_RECENT_WINDOW_RATIO))
  );
}

/**
 * Resolve the keep policy for an agent.
 *
 * Priority: explicit `keepRecentTokens` > derived-from-context-window >
 * legacy `keepRecentFlows`.
 *
 * @param config - Compaction config (partial; defaults applied where relevant)
 * @param contextWindow - Model input context window in tokens, if known
 */
export function resolveKeepPolicy(
  config: Partial<CompactionConfig> | null | undefined,
  contextWindow?: number
): KeepPolicy {
  const explicit = config?.keepRecentTokens;
  if (explicit && explicit > 0) {
    return { kind: "tokens", keepRecentTokens: explicit };
  }
  if (contextWindow && contextWindow > 0) {
    return {
      kind: "tokens",
      keepRecentTokens: deriveKeepRecentTokens(contextWindow, resolveReserveTokens(config ?? undefined)),
    };
  }
  return { kind: "turns", keepRecentFlows: config?.keepRecentFlows ?? DEFAULT_COMPACTION_CONFIG.keepRecentFlows };
}

/**
 * Projection options payload derived from a keep policy — spread into
 * `getModelVisibleMessages` / `applyCompactionResult` options.
 */
export function keepPolicyProjectionOptions(policy: KeepPolicy): {
  keepRecentTokens?: number;
  keepRecentFlows?: number;
} {
  return policy.kind === "tokens"
    ? { keepRecentTokens: policy.keepRecentTokens }
    : { keepRecentFlows: policy.keepRecentFlows };
}

/**
 * Resolve the absolute token count at which auto-compaction triggers.
 *
 * When the model context window is known the threshold is window-relative:
 * `(contextWindow - reserveTokens) * compactAtPercent / 100`. Otherwise the
 * legacy absolute `tokenThreshold` path applies.
 *
 * @returns `{ triggerAt, windowRelative }`
 */
export function resolveAutoCompactTrigger(
  config: Partial<CompactionConfig>,
  contextWindow?: number
): { triggerAt: number; windowRelative: boolean } {
  const compactAtPercent = config.compactAtPercent ?? DEFAULT_COMPACTION_CONFIG.compactAtPercent;
  const reserveTokens = resolveReserveTokens(config);
  if (contextWindow && contextWindow > 0) {
    const effectiveThreshold = Math.max(1_000, contextWindow - reserveTokens);
    return { triggerAt: Math.floor((effectiveThreshold * compactAtPercent) / 100), windowRelative: true };
  }
  const tokenThreshold = config.tokenThreshold ?? DEFAULT_COMPACTION_CONFIG.tokenThreshold;
  return { triggerAt: Math.floor((tokenThreshold * compactAtPercent) / 100), windowRelative: false };
}
