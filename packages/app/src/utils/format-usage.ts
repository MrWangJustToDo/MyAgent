/**
 * Compact token/usage formatting for footers and task headers.
 */

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const thousands = n / 1000;
    const rounded = Math.round(thousands * 100) / 100;
    return `${rounded.toFixed(2)}k`;
  }
  const millions = n / 1_000_000;
  const rounded = Math.round(millions * 100) / 100;
  return `${rounded.toFixed(2)}M`;
}

/**
 * The prompt-token reading this label must print.
 *
 * `inputTokens` alone is NOT the prompt: under an exclusive upstream
 * (Anthropic/DeepSeek native) it holds only the cache-miss part, so a fully cached
 * subagent run reads as ~0. Mirrors `promptTokensOf` in core, mirrored here rather
 * than imported because `@codent/app` must not reach into core internals and the
 * rule is two lines. Prefer an explicit `billedInputTokens` whenever the producer
 * supplied one — a subagent's own tracker already accumulated the exact sum, and
 * re-deriving it from an *aggregate* is lossy (see AGENTS.md "Context-window fill").
 */
export function resolvePromptTokens(usage: {
  inputTokens: number;
  billedInputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  if (typeof usage.billedInputTokens === "number" && Number.isFinite(usage.billedInputTokens)) {
    return usage.billedInputTokens;
  }
  const cached = (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const input = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  return cached > input ? input + cached : input;
}

export function formatUsageBrief(usage: {
  inputTokens: number;
  outputTokens: number;
  billedInputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): string {
  return `${formatCompactNumber(resolvePromptTokens(usage))} in / ${formatCompactNumber(usage.outputTokens)} out`;
}

/**
 * Context-window fill for the footer (Pi-style), separate from lifetime totals.
 *
 * - When limit unknown: empty string (caller hides the segment)
 * - When window usage is 0 after compact / before first response: `?/1M`
 * - Otherwise: `35%/1M`
 */
export function formatContextUsage(options: {
  contextFillTokens: number;
  tokenLimit: number;
  percent: number;
}): string {
  const { contextFillTokens, tokenLimit, percent } = options;
  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0) return "";

  const limitLabel = formatCompactNumber(tokenLimit);
  if (!Number.isFinite(contextFillTokens) || contextFillTokens <= 0) {
    return `?/${limitLabel}`;
  }

  const pct = Math.min(100, Math.max(0, percent));
  return `${pct.toFixed(0)}%/${limitLabel}`;
}
