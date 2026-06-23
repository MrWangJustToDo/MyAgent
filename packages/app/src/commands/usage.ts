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

    const usage = context.getTotalUsage();
    const cost = context.getTotalCost();
    const session = agent.getSessionData();
    const modelInfo = agent.getModelInfo();
    const pricing = context.getPricing();

    const lines: string[] = [];

    if (session) {
      lines.push(`  Session:      ${session.name} (${session.id})`);
    }
    if (modelInfo) {
      lines.push(`  Model:        ${modelInfo.name}`);
    }

    lines.push("");
    lines.push(`  Input:        ${fmt(usage.inputTokens)} tokens`);

    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    if (cacheRead > 0) {
      lines.push(`    Cache read:   ${fmt(cacheRead)}${pct(cacheRead, usage.inputTokens)}`);
    }
    if (cacheWrite > 0) {
      lines.push(`    Cache write:  ${fmt(cacheWrite)}`);
    }

    lines.push(`  Output:       ${fmt(usage.outputTokens)} tokens`);

    const reasoning = usage.reasoningTokens ?? 0;
    if (reasoning > 0) {
      const text = usage.outputTokens - reasoning;
      lines.push(`    Reasoning:    ${fmt(reasoning)}${pct(reasoning, usage.outputTokens)}`);
      lines.push(`    Text:         ${fmt(text)}`);
    }

    lines.push(`  Total:        ${fmt(usage.totalTokens)} tokens`);

    if (pricing) {
      lines.push("");
      lines.push(
        `  Pricing:      $${pricing.inputPerM}/M in, $${pricing.outputPerM}/M out` +
          (pricing.cacheReadPerM ? `, $${pricing.cacheReadPerM}/M cache` : "")
      );
    }

    lines.push(`  Session cost: ${formatCost(cost)}`);

    return { ok: true, message: lines.join("\n") };
  },
});
