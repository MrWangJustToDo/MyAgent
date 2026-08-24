/**
 * Task pre-fork coordinator — starts subagents eagerly while the model is
 * still streaming, so multiple `task` calls in one turn run in parallel.
 *
 * TanStack AI executes tool calls sequentially (`executeToolCalls` yields each
 * result in order). But by the time the execution phase starts, every tool
 * call's arguments have finished streaming (`TOOL_CALL_END`). The pre-fork
 * middleware spawns the subagent at that moment; when the sequential loop
 * reaches the `task` tool, its `execute` just joins the already-running
 * promise. Wall-clock cost of N parallel tasks ≈ the slowest one.
 */

import type { SubagentResult } from "./types.js";
import type { ManagedAgent } from "../../runtime-types/hosts.js";

/** Cap on concurrently pre-forked subagents per parent run. */
export const MAX_ACTIVE_TASK_PREFORKS = 4;

interface PreforkEntry {
  promise: Promise<SubagentResult>;
  abort: () => void;
  remove: () => void;
}

export class TaskPreforkCoordinator {
  private readonly entries = new Map<string, PreforkEntry>();

  get size(): number {
    return this.entries.size;
  }

  has(toolCallId: string): boolean {
    return this.entries.has(toolCallId);
  }

  /**
   * Start a subagent run in the background.
   *
   * Returns false when the call was already pre-forked or the concurrency cap
   * is reached — the caller then falls back to serial execution. Returns an
   * abort handle so the epoch/retry cleanup can cancel orphans.
   */
  start(toolCallId: string, abort: () => void, run: () => Promise<SubagentResult>): boolean {
    if (this.entries.has(toolCallId)) return true;
    if (this.entries.size >= MAX_ACTIVE_TASK_PREFORKS) return false;

    const entry: PreforkEntry = {
      promise: run(),
      abort,
      remove: () => this.entries.delete(toolCallId),
    };
    this.entries.set(toolCallId, entry);
    // Background failures are observed by the joiner; swallow here so a lost
    // race never becomes an unhandled rejection.
    void entry.promise.catch(() => {});
    return true;
  }

  /**
   * Join a pre-forked run and release its slot. Returns null when the call was
   * not pre-forked (caller runs it serially).
   */
  async join(toolCallId: string): Promise<SubagentResult | null> {
    const entry = this.entries.get(toolCallId);
    if (!entry) return null;
    this.entries.delete(toolCallId);
    return entry.promise;
  }

  /** Abort every pending pre-forked run and drop bookkeeping (new stream epoch). */
  abortAll(): void {
    for (const entry of this.entries.values()) {
      try {
        entry.abort();
      } catch {
        // Cleanup must never mask the original failure.
      }
    }
    this.entries.clear();
  }
}

const coordinators = new WeakMap<ManagedAgent, TaskPreforkCoordinator>();

/** Get (or lazily create) the pre-fork coordinator for a parent agent. */
export function getTaskPreforkCoordinator(parentManaged: ManagedAgent): TaskPreforkCoordinator {
  let coordinator = coordinators.get(parentManaged);
  if (!coordinator) {
    coordinator = new TaskPreforkCoordinator();
    coordinators.set(parentManaged, coordinator);
  }
  return coordinator;
}
