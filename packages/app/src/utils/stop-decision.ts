/**
 * The decision a host makes when the user cancels a run: which subagents to stop
 * first, and whether the session itself must be stopped.
 *
 * This is pure and exported so the branch is testable. It regressed once precisely
 * because it was inlined in a React hook with no coverage: the active set was not
 * filtered by task binding, so a running compaction summarizer — which is active, and
 * present in the `subagents` snapshot by design — satisfied "a subagent is active",
 * took the subagent-first branch, and skipped the session stop entirely. The session
 * then kept running and restarted compaction on its own.
 *
 * The rule: a row may only suppress the session stop if it is a user-visible `task`
 * delegation. Internal workers have no cancellation contract with the parent model, so
 * they are stopped by the session stop (via the parent's abort cascade), not instead of it.
 */

import { isActiveStatus, isUserVisibleTaskRow } from "@codent/core";

import type { AgentSessionSubagentSummary } from "@codent/core";

export interface StopDecision {
  /** Task subagents to stop before the session, so their cancellation reaches the parent. */
  taskSubagentIds: string[];
  /**
   * Whether to stop the session run itself.
   *
   * False only when a task subagent was stopped instead: that branch exists so the task's
   * cancellation result is readable by the parent model, which requires the parent run to
   * finish the turn. Internal workers never set this to false.
   */
  stopSession: boolean;
}

/**
 * Resolve what a cancel should stop.
 *
 * @example
 * const { taskSubagentIds, stopSession } = resolveStopDecision(session.getSnapshot().subagents);
 * for (const id of taskSubagentIds) resolveAgentSession(id)?.dispatch({ type: "stop" });
 * if (stopSession) session.dispatch({ type: "stop" });
 */
export function resolveStopDecision(rows: readonly AgentSessionSubagentSummary[]): StopDecision {
  const taskSubagentIds = rows
    .filter(isUserVisibleTaskRow)
    .filter((row) => isActiveStatus(row.status))
    .map((row) => row.id);

  return { taskSubagentIds, stopSession: taskSubagentIds.length === 0 };
}
