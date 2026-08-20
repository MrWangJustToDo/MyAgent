import { isActiveStatus } from "../../managers/agent-status.js";

import type { AgentStatus } from "../../runtime-types/agent-status.js";

/**
 * Whether mid-run user input should be queued (steer/followUp) instead of
 * starting a fresh {@link AgentChatController} pump via {@link sendMessage}.
 *
 * Uses {@link pumpDepth} — not {@link isActiveStatus} alone — so a finished
 * pump that left status `running` (tool-phase continuation still needed) does
 * not trap follow-up messages in an undrained queue.
 */
export function shouldDeferMidRunQueue(options: { pumpDepth: number; status: AgentStatus }): boolean {
  if (options.pumpDepth > 0) return true;
  const { status } = options;
  if (status === "waiting" || status === "awaiting_user") return true;
  // Stale "running/thinking/responding" with pumpDepth 0 — allow sendMessage to resume.
  return false;
}

/** True when status looks active but no pump is executing (stale continuation). */
export function isStaleActiveRunStatus(options: { pumpDepth: number; status: AgentStatus }): boolean {
  return options.pumpDepth === 0 && isActiveStatus(options.status) && !shouldDeferMidRunQueue(options);
}
