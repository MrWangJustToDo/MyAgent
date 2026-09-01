/**
 * Reactive compact retry orchestration — the emergency-compaction retry shell
 * that delegates to the core implementation in `agent/compaction/reactive-compact.ts`.
 *
 * Kept as a separate file (distinct name from the core implementation) so
 * "reactive-compact" unambiguously refers to the compaction layer.
 */
import { isPromptTooLongError } from "../../agent/compaction/reactive-compact.js";

import type { AgentManager } from "../agent-manager.js";
import type { ManagedAgent } from "../managed-agent.js";

async function applyReactiveCompactRetry(managed: ManagedAgent): Promise<boolean> {
  if (!managed.ui) return false;
  managed.statusController.endCompaction();
  managed.setError("");
  return true;
}

/**
 * Attempt emergency compaction when the model rejects the request as too long.
 * Subagents (parentId set) never retry via this path.
 */
export async function tryReactiveCompactRetry(
  managed: ManagedAgent,
  manager: AgentManager,
  error: unknown
): Promise<boolean> {
  if (managed.parentId) return false;
  if (!isPromptTooLongError(error)) return false;

  const compacted = await managed.handleReactiveCompact(error, manager);
  if (!compacted) return false;

  return applyReactiveCompactRetry(managed);
}
