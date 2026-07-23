import type { ManagedAgent } from "@my-agent/core";

export type PlanToggleFeedback = (message: string, level?: "success" | "info" | "error") => void;

/**
 * Toggle plan mode and show a short footer feedback message.
 * @returns true when an agent was available and toggle ran.
 */
export function togglePlanModeWithFeedback(
  agent: ManagedAgent | null | undefined,
  setFeedback: PlanToggleFeedback
): boolean {
  if (!agent) return false;
  const phase = agent.togglePlanMode();
  if (phase === "planning") {
    setFeedback("Plan mode on — explore read-only, then create_plan", "info");
  } else {
    setFeedback("Plan mode off", "info");
  }
  return true;
}
