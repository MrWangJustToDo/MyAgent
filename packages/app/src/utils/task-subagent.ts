/**
 * Which subagent row a `task` tool call should render.
 *
 * The root cause of the orphan (a pre-fork aborted at a model-iteration boundary, then a
 * second subagent spawned for the same call id) is fixed in core. This is the read-side
 * half of the defence: resolving a call id to "the first row with this binding" is a trap
 * that outlives its cause. `snapshot.subagents` is built from `childIds`, which is spawn
 * order, so an orphan always precedes the run that replaced it — the first match is exactly
 * the wrong one when both exist.
 *
 * Two properties make the resolution robust rather than merely reordered:
 *
 * 1. **A live row beats a stopped one.** Whatever the orphan's final status, the run that is
 *    still working is the one whose state and progress the caller asked for.
 * 2. **On a tie, the LATEST row wins.** Among equally-live (or equally-stopped) candidates
 *    the later spawn is the current run; the earlier one is the discarded attempt. Picking
 *    the first would hand back the dead attempt even when the live one exists.
 *
 * @example
 * const row = resolveTaskSubagent(snapshot.subagents, toolCallId);
 * if (row) renderTaskRow(row);
 */

import { isActiveStatus } from "@codent/core";

import type { AgentSessionSubagentSummary } from "@codent/core";

/** Live rows outrank stopped ones; ties break toward the later (newer) row. */
function rank(row: AgentSessionSubagentSummary): number {
  return isActiveStatus(row.status) ? 1 : 0;
}

export function resolveTaskSubagent(
  rows: readonly AgentSessionSubagentSummary[],
  taskId: string
): AgentSessionSubagentSummary | undefined {
  if (!taskId) return undefined;
  let picked: AgentSessionSubagentSummary | undefined;
  for (const row of rows) {
    if (row.parentTaskToolCallId !== taskId) continue;
    // `>=` on the rank is deliberate: an equal rank replaces, which is what makes the later
    // row win. A strictly-greater test would keep the first of two equally-ranked candidates
    // — the orphan, in the exact shape this exists to survive.
    if (!picked || rank(row) >= rank(picked)) {
      picked = row;
    }
  }
  return picked;
}
