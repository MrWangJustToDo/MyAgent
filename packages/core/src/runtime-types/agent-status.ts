// ============================================================================
// Agent Status
// ============================================================================

export type AgentStatus =
  | "idle"
  | "running"
  | "completed"
  | "error"
  | "aborted"
  | "waiting"
  | "awaiting_user"
  | "compacting"
  | "thinking"
  | "responding";

export type RunFinalizeReason = "finished" | "aborted" | "error";

// ============================================================================
// Status predicates (shared — importable from agent/ domain modules)
// ============================================================================

/** Statuses that must not be overwritten when a stream finishes normally. */
export const TERMINAL_STATUSES = new Set<AgentStatus>(["aborted", "error", "waiting", "awaiting_user"]);

/** Statuses indicating an agent is actively doing work (used for cancellation ordering). */
export const ACTIVE_STATUSES = new Set<AgentStatus>([
  "running",
  "thinking",
  "responding",
  "waiting",
  "awaiting_user",
  "compacting",
]);

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
