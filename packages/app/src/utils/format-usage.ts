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
