/**
 * Why a `task` subagent stopped, and what its summary says about it.
 *
 * A subagent's run can end through three different aborts and the task summary has to
 * be honest about which one it was, because the text reaches both the transcript UI and
 * the parent model's context:
 *
 * | Reason | What happened | Summary notice |
 * |---|---|---|
 * | `user` | the user cancelled (Esc) | `[Task cancelled by user.]` |
 * | `parent-run` | the parent's run was discarded (stream restart) or ended while the subagent streamed — e.g. the approval pause that also restarts the run | `[Task stopped with its parent run.]` |
 * | `parent-stop` | the parent agent was aborted or destroyed, taking its children with it | `[Task stopped with its parent agent.]` |
 * | `unknown` | aborted, but nothing recorded why | `[Task cancelled.]` |
 *
 * The reason is read from the abort signal, which is the one channel every path
 * already flows through: `AbortController.abort(reason)` reaches the subagent as
 * `signal.reason`, so all three producers are wired at once —
 *
 * - `ManagedAgent.abort(reason)` passes its reason down through
 *   `configureSubagentAbort` → `parent.abort("user-cancelled")` (Esc) or
 *   `parent.abort()` inside `resetRunState` (stream restart),
 * - `abortManagedAgentRun` appends `"user-cancelled"` itself, and
 * - `cascadeAbortToChildren` → `child.abort("parent-aborted" | parent reason)`.
 *
 * **Before this, every abort was reported as `[Task cancelled by user.]`** — the
 * constant was applied unconditionally. An orphan created by a stream restart was
 * therefore recorded as a user cancellation that never happened, in the log and in the
 * parent model's context, which is the single most expensive way this can be wrong:
 * the one artefact a reader uses to tell "the model stopped this" from "the operator
 * stopped this" asserted the wrong one.
 */

/** Raw abort reason as it travels on the signal. */
export interface SubagentAbortReason {
  /** The abort reason when it was a string (e.g. `user-cancelled`, `parent-aborted`). */
  reason?: unknown;
  /** Whether the subagent's own run was aborted at all. */
  aborted: boolean;
}

export type SubagentStopReason = "user" | "parent-run" | "parent-stop" | "unknown";

/** Every stop reason, in a runtime list — the payload/tool schemas derive their enum from it. */
export const SUBAGENT_STOP_REASONS: readonly SubagentStopReason[] = ["user", "parent-run", "parent-stop", "unknown"];

/** Notices, exported so consumers match on them instead of on a copied literal. */
export const SUBAGENT_CANCELLED_NOTICE = "[Task cancelled by user.]";
export const SUBAGENT_PARENT_RUN_NOTICE = "[Task stopped with its parent run.]";
export const SUBAGENT_PARENT_STOP_NOTICE = "[Task stopped with its parent agent.]";
export const SUBAGENT_ABORTED_NOTICE = "[Task cancelled.]";

/** Every notice `applySubagentStopNotice` can append — for "already noticed" checks. */
export const SUBAGENT_STOP_NOTICES: readonly string[] = [
  SUBAGENT_CANCELLED_NOTICE,
  SUBAGENT_PARENT_RUN_NOTICE,
  SUBAGENT_PARENT_STOP_NOTICE,
  SUBAGENT_ABORTED_NOTICE,
];

/**
 * Classify an abort reason.
 *
 * Ordering matters: the parent cascade runs *after* the agent's own stop, so a parent
 * stop whose own run was already aborted passes `"user-cancelled"` down to the child
 * while the parent agent's own stop reason is `"parent-aborted"`. A child aborted by
 * that cascade carries the parent's reason, which is what distinguishes "the parent
 * agent stopped" from "the run restarted" — the two reasons that produce orphans.
 */
export function resolveSubagentStopReason(info: SubagentAbortReason): SubagentStopReason {
  if (!info.aborted) return "unknown";
  const reason = typeof info.reason === "string" ? info.reason : "";
  if (reason === "user-cancelled") return "user";
  if (reason === "parent-aborted") return "parent-stop";
  if (reason === "agent-destroyed") return "parent-stop";
  // A bare `abort()` is the run-lifecycle reset/restart path, which is where the
  // pre-fork orphan comes from. Any other string is a caller's own label and is not
  // strong enough to claim a user did it, so it reads as "the parent's run moved on".
  return "parent-run";
}

/** The notice that belongs to a stop reason. */
export function subagentStopNotice(reason: SubagentStopReason): string {
  switch (reason) {
    case "user":
      return SUBAGENT_CANCELLED_NOTICE;
    case "parent-run":
      return SUBAGENT_PARENT_RUN_NOTICE;
    case "parent-stop":
      return SUBAGENT_PARENT_STOP_NOTICE;
    default:
      return SUBAGENT_ABORTED_NOTICE;
  }
}
