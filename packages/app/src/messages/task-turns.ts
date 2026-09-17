import type { AgentIterationState } from "@my-agent/core";

/**
 * Format a subagent's loop progress for display, e.g. `3/50`.
 *
 * Three call sites render this — the task row's parenthetical, the live subagent line
 * under it, and the Ctrl+T task list — so the string lives in one place rather than
 * being re-derived per surface.
 *
 * Returns `null` when there is nothing honest to show, which callers use to omit the
 * segment entirely rather than render `0/0`:
 *
 *   - `current` is 0 until the child reports its first iteration (the retained
 *     `iteration` channel starts at 0 for a run that has not started), and
 *   - `max` is 0 when the budget is unknown, in which case the count stands alone
 *     (`3`, not `3/0`).
 *
 * **Not restorable, unlike a tool's duration.** A duration survives a restore because it
 * is written into the tool output (`durationMs` is part of each tool's `outputSchema`),
 * so it comes back with the persisted message. This value has no such carrier: `iteration`
 * is live run state on the session snapshot, and it is deliberately not in `SessionData`.
 * A finished `task` part does carry a frozen `output.iterations`, but that is a different
 * number — it counts the child's own rounds (`countSubagentIterations`: one per assistant
 * message that starts a tool batch), whereas the live `current` counts model turns from
 * TanStack's `IterationInfo`. A restored transcript therefore shows no turn readout at all,
 * and showing the persisted count there would silently change what the number means.
 * Callers gate this on the task still being live, which is why that is correct rather than
 * merely convenient.
 */
export function formatTaskTurns(iteration: AgentIterationState | undefined): string | null {
  if (!iteration || iteration.current <= 0) return null;
  return iteration.max > 0 ? `${iteration.current}/${iteration.max}` : `${iteration.current}`;
}
