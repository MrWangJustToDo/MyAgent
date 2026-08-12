import { formatPlanModeFooterLabel, todoProgressFromItems } from "./plan-footer-label.js";

import type { AgentMode, AgentSessionSnapshot } from "@my-agent/core";

export type StatusBarModeSource = Pick<AgentSessionSnapshot, "mode" | "plan" | "todos">;

/**
 * Compose Footer mode label from a Session snapshot (no ManagedAgent).
 */
export function formatStatusBarModeLabel(source: StatusBarModeSource | null | undefined): string {
  if (!source) return "Normal";

  const mode: AgentMode = source.mode;

  if (mode === "auto") return "Auto";

  if (mode === "plan") {
    const progress = source.plan.phase === "executing" ? todoProgressFromItems(source.todos) : null;
    const planLabel = formatPlanModeFooterLabel(source.plan, progress);
    return planLabel ?? "Plan";
  }

  return "Normal";
}
