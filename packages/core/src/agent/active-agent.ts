/**
 * Global active agent reference.
 *
 * Allows tools to access the currently running agent's context
 * (e.g., token usage, token limit) without threading references through
 * every tool factory.
 */

import type { AgentContext } from "./agent-context";

let _activeContext: AgentContext | null = null;

/**
 * Set the active agent context. Called when an agent starts running.
 */
export function setActiveContext(context: AgentContext | null): void {
  _activeContext = context;
}

/**
 * Get the active agent context. Returns null if no agent is running.
 */
export function getActiveContext(): AgentContext | null {
  return _activeContext;
}

/**
 * Get remaining token capacity from the active agent context.
 * Returns Infinity if no context or no limit is set.
 */
export function getRemainingTokenBudget(): number {
  if (!_activeContext) return Infinity;
  const limit = _activeContext.getTokenLimit();
  if (limit <= 0) return Infinity;
  const used = _activeContext.getUsage().inputTokens;
  // Reserve 20% for model response
  return Math.max(0, Math.floor((limit - used) * 0.8));
}
