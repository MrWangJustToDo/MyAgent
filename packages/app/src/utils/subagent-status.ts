import { COLORS } from "../theme/colors.js";

import type { AgentSessionSubagentSummary } from "@my-agent/core";

const STATUS_ICON: Record<string, string> = {
  running: ">",
  thinking: ">",
  responding: ">",
  compacting: ">",
  waiting: "⌛",
  awaiting_user: "⌛",
  completed: "✓",
  error: "✗",
  aborted: "⊘",
  idle: "○",
};

export function getStatusIcon(status: string): string {
  return STATUS_ICON[status] ?? "?";
}

export function getStatusColor(status: string): string {
  if (status === "completed") return COLORS.success;
  if (status === "error") return COLORS.danger;
  if (status === "aborted") return COLORS.muted;
  if (["running", "thinking", "responding", "compacting"].includes(status)) return COLORS.warning;
  return COLORS.muted;
}

/** Display-level activity check for subagent panel rows (distinct from core's AgentStatus predicate). */
export function isSubagentActiveStatus(status: string): boolean {
  return ["running", "thinking", "responding", "compacting", "waiting", "awaiting_user"].includes(status);
}

export function getTaskLabel(task: AgentSessionSubagentSummary): string {
  if (task.description) return task.description;
  const name = task.name ?? task.id;
  return name.startsWith("subagent-") ? name.slice("subagent-".length) : name;
}
