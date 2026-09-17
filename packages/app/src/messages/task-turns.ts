import type { AgentIterationState } from "@my-agent/core";

/** The frozen pair a finished `task` part carries in its output. */
export interface TaskTurnCounts {
  iterations?: number;
  maxIterations?: number;
}

/**
 * Format a subagent's loop progress for display, e.g. `3/50`.
 *
 * Two call sites render this — the task row's parenthetical and the subagent detail
 * panel's header — so the string lives in one place rather than being re-derived per
 * surface.
 *
 * ## Live vs restored
 *
 * A live task reads the child's `iteration` state (used plus the _child's_ configured
 * budget). Once that state is gone — a child session does not exist after a restore — the
 * frozen pair on the task output takes over, which is why both numbers are persisted. The
 * two sources render the same way on purpose: the live value counts model turns
 * (`IterationInfo.iteration + 1`), and the frozen `iterations` is now that same count, so a
 * restored row does not silently change what the number means.
 *
 * Returns `null` when there is nothing honest to show, which callers use to omit the
 * segment entirely rather than render `0/0`:
 *
 *   - `used` is 0 before the child reports a first iteration, and for a task that never ran
 *     (a cancelled pre-fork stub records `iterations: 0`), and
 *   - the budget is 0 when it is unknown, in which case the count stands alone (`3`, not
 *     `3/0`).
 */
export function formatTaskTurns(live: AgentIterationState | undefined, frozen?: TaskTurnCounts): string | null {
  const used = live && live.current > 0 ? live.current : (frozen?.iterations ?? 0);
  if (used <= 0) return null;
  const budget = (live && live.current > 0 ? live.max : undefined) || frozen?.maxIterations || 0;
  return budget > 0 ? `${used}/${budget}` : `${used}`;
}
