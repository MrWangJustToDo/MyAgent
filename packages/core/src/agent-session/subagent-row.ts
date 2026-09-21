/**
 * Subagent row classification for cancellation ordering.
 *
 * The `subagents` snapshot deliberately includes internal workers (compaction and
 * memory summarizers) so the task panel can show hidden agents. That makes the
 * snapshot the wrong thing to ask "is a user-visible task running?" — a compaction
 * summarizer runs as `compacting`, which counts as active, so an unfiltered active
 * set is satisfied by the summarizer itself.
 *
 * The discriminator is the task binding. A `task` delegation is spawned with the
 * parent's `task` toolCallId as `parentTaskToolCallId` (`runSubagent` copies it onto
 * the child as `parentTaskId`); an internal worker is spawned without one. Only a
 * task-bound row participates in the subagent-first cancellation protocol, where the
 * child is stopped first so its cancellation notice reaches the parent and the parent
 * run continues. Internal workers have no such contract — their output never returns
 * to the parent model — so they must never make a caller skip session cancellation.
 *
 * @example
 * const tasks = snapshot.subagents.filter(isUserVisibleTaskRow).filter(active);
 * if (tasks.length > 0) stopTasks(tasks);
 * // The session stop is unconditional — it must not depend on the filter above.
 */
export interface SubagentRowLike {
  /** Present only for a user-visible `task` delegation; absent for internal workers. */
  parentTaskToolCallId?: string;
}

/**
 * Whether this subagent row is a user-visible `task` delegation.
 *
 * Used to decide which rows may take the subagent-first cancellation branch. A row
 * without a task binding is an internal worker and MUST NOT suppress a session stop.
 */
export function isUserVisibleTaskRow(row: SubagentRowLike): boolean {
  return typeof row.parentTaskToolCallId === "string" && row.parentTaskToolCallId.length > 0;
}
