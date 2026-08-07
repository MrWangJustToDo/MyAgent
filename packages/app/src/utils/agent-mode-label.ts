import { formatPlanModeFooterLabel, todoProgressFromItems } from "@my-agent/core";

import type { AgentMode, ManagedAgent } from "@my-agent/core";

/**
 * Compose Footer mode label from the unified agent mode.
 */
export function formatStatusBarModeLabel(agent: ManagedAgent | null | undefined): string {
  if (!agent) return "Normal";

  const mode: AgentMode = agent.getAgentMode();

  if (mode === "auto") return "Auto";

  if (mode === "plan") {
    const planState = agent.getPlanModeState();
    const todos = agent.getTodoManager();
    const progress = planState.phase === "executing" && todos ? todoProgressFromItems(todos.getItems()) : null;
    const planLabel = formatPlanModeFooterLabel(planState, progress);
    return planLabel ?? "Plan";
  }

  return "Normal";
}
