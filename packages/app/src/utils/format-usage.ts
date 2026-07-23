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

export function formatUsageBrief(usage: { inputTokens: number; outputTokens: number }): string {
  return `${formatCompactNumber(usage.inputTokens)} in / ${formatCompactNumber(usage.outputTokens)} out`;
}

/**
 * Context-window fill for the footer (Pi-style), separate from lifetime totals.
 *
 * - When limit unknown: empty string (caller hides the segment)
 * - When window usage is 0 after compact / before first response: `?/1M`
 * - Otherwise: `35%/1M`
 */
export function formatContextUsage(options: {
  windowInputTokens: number;
  tokenLimit: number;
  percent: number;
}): string {
  const { windowInputTokens, tokenLimit, percent } = options;
  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0) return "";

  const limitLabel = formatCompactNumber(tokenLimit);
  if (!Number.isFinite(windowInputTokens) || windowInputTokens <= 0) {
    return `?/${limitLabel}`;
  }

  const pct = Math.min(100, Math.max(0, percent));
  return `${pct.toFixed(0)}%/${limitLabel}`;
}
