import type { AgentStatus } from "./types.js";

/** Statuses that must not be overwritten when a stream finishes normally. */
export const TERMINAL_STATUSES = new Set<AgentStatus>(["aborted", "error", "waiting"]);

/** Statuses indicating an agent is actively doing work (used for cancellation ordering). */
export const ACTIVE_STATUSES = new Set<AgentStatus>(["running", "thinking", "responding", "waiting", "compacting"]);

export function isTerminalStatus(status: AgentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActiveStatus(status: AgentStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Resolve the status to apply when an agent run finishes. */
export function resolveFinishStatus(current: AgentStatus, errorMessage: string): AgentStatus {
  if (isTerminalStatus(current)) return current;
  if (errorMessage) return "error";
  return "completed";
}
