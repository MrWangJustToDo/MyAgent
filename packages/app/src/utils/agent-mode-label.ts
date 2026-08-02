import { formatPlanModeFooterLabel, todoProgressFromItems } from "@my-agent/core";

import type { ManagedAgent } from "@my-agent/core";

/**
 * Compose Footer mode label: optional `auto` + plan phase (or `Normal`).
 */
export function formatStatusBarModeLabel(agent: ManagedAgent | null | undefined): string {
  if (!agent) return "Normal";

  const parts: string[] = [];
  if (agent.isAutoApproveEnabled()) {
    parts.push("auto");
  }

  const planState = agent.getPlanModeState();
  const todos = agent.getTodoManager();
  const progress = planState.phase === "executing" && todos ? todoProgressFromItems(todos.getItems()) : null;
  const planLabel = formatPlanModeFooterLabel(planState, progress);
  if (planLabel) {
    parts.push(planLabel);
  }

  return parts.length > 0 ? parts.join(" · ") : "Normal";
}
