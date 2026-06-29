import { registerCommand } from "./registry.js";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(cost: number): string {
  if (cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "";
  return ` (${((part / total) * 100).toFixed(1)}%)`;
}

registerCommand({
  name: "usage",
  description: "Show session token usage and cost",
  usage: "/usage",
  immediate: true,
  execute: (_args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const context = agent.getContext();
    if (!context) {
      return { ok: false, error: "Agent context not available" };
    }

    const totalUsage = context.getTotalUsage();
    // usage.inputTokens is the latest step's input (current context window size)
    const currentUsage = context.getUsage();
    const cost = context.getTotalCost();
    const tokenLimit = context.getTokenLimit();
    const session = agent.getSessionData();
    const modelInfo = agent.getModelInfo();
    const pricing = context.getPricing();

    // Cache hit ratio from lifetime usage (persisted, survives resume).
    // Falls back to agent's in-memory ratio when no usage has been tracked yet.
    const cacheHitRatio =
      totalUsage.inputTokens > 0
        ? (totalUsage.cacheReadTokens ?? 0) / totalUsage.inputTokens
        : agent.getCacheHitRatio();
    const lines: string[] = [];

    if (session) {
      lines.push(`  Session:      ${session.name} (${session.id})`);
    }
    if (modelInfo) {
      lines.push(`  Model:        ${modelInfo.name}`);
    }

    // --- Cache hit ratio banner (when meaningful data exists) ---
    if (cacheHitRatio > 0) {
      lines.push("");
      lines.push(`  Cache hit:    ${(cacheHitRatio * 100).toFixed(1)}%`);
    }

    // --- Lifetime (cumulative) usage ---
    lines.push("");
    lines.push(`  ── Session Lifetime ──`);
    lines.push(`  Input:        ${fmt(totalUsage.inputTokens)} tokens (cumulative)`);

    const totalCacheRead = totalUsage.cacheReadTokens ?? 0;
    const totalCacheWrite = totalUsage.cacheWriteTokens ?? 0;
    if (totalCacheRead > 0) {
      lines.push(`    Cache read:   ${fmt(totalCacheRead)}${pct(totalCacheRead, totalUsage.inputTokens)}`);
    }
    if (totalCacheWrite > 0) {
      lines.push(`    Cache write:  ${fmt(totalCacheWrite)}${pct(totalCacheWrite, totalUsage.inputTokens)}`);
    }

    lines.push(`  Output:       ${fmt(totalUsage.outputTokens)} tokens`);

    const totalReasoning = totalUsage.reasoningTokens ?? 0;
    if (totalReasoning > 0) {
      const text = totalUsage.outputTokens - totalReasoning;
      lines.push(`    Reasoning:    ${fmt(totalReasoning)}${pct(totalReasoning, totalUsage.outputTokens)}`);
      lines.push(`    Text:         ${fmt(text)}`);
    }

    lines.push(`  Total:        ${fmt(totalUsage.totalTokens)} tokens`);

    // --- Current context status ---
    const contextInput = currentUsage.inputTokens;
    if (contextInput > 0) {
      const contextCacheRead = currentUsage.cacheReadTokens ?? 0;
      const pctText =
        tokenLimit > 0
          ? ` (${Math.min(100, (contextInput / tokenLimit) * 100).toFixed(0)}% of ${fmt(tokenLimit)})`
          : "";
      lines.push("");
      lines.push(`  ── Current Context ──`);
      lines.push(`  Context:      ${fmt(contextInput)} tokens${pctText}`);
      if (contextCacheRead > 0 && totalCacheRead > 0) {
        lines.push(`    Cache read:   ${fmt(contextCacheRead)}${pct(contextCacheRead, contextInput)}`);
      }
    }

    if (pricing) {
      lines.push("");
      lines.push(
        `  Pricing:      ${pricing.inputPerM}/M in, ${pricing.outputPerM}/M out` +
          (pricing.cacheReadPerM ? `, ${pricing.cacheReadPerM}/M cache` : "")
      );
    }

    lines.push(`  Session cost: ${formatCost(cost)}`);

    return { ok: true, message: lines.join("\n") };
  },
});
