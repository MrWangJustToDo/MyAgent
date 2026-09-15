/**
 * Per-task run-phase state machine — one {@link TaskRunState} instance per
 * `task` tool call, owned by the parent agent.
 *
 * Phases are one-way and authoritative (no message inference):
 * - `running`  — the underlying subagent is exploring (its running/thinking/
 *                responding statuses fold into this single task-level phase)
 * - `summary`  — the subagent called `begin_summary` and is writing its own report
 * - `limit`    — the subagent was force-stopped by the step budget and the
 *                progress-summary fallback is generating the report for it
 *
 * `limit` is deliberately NOT folded into `summary`. Both stream a report, but
 * only one of them means the task finished on its own terms — and the parent's
 * `task` tool result (`reachedLimit` / `incomplete`) already distinguishes them,
 * so collapsing them here made the UI report a budget cutoff as a normal end.
 * The fallback can also be disabled by the spawner; the parent still gets
 * `reachedLimit` from the message-derived stats, so `limit` is absent in that
 * case rather than wrong.
 *
 * Registries are keyed by parent ManagedAgent (WeakMap) and indexed by
 * parentTaskToolCallId, mirroring how the UI addresses tasks.
 */

import type { ManagedAgent } from "../../runtime-types/hosts.js";

export type TaskRunPhase = "running" | "summary" | "limit";

/** Phases after `running`; both are terminal. */
export type TaskRunTerminalPhase = Exclude<TaskRunPhase, "running">;

export class TaskRunState {
  /** Current phase — one-way running → summary | limit. */
  phase: TaskRunPhase = "running";

  constructor(readonly toolCallId: string) {}

  /** Enter a terminal phase; returns true when this call performed the transition. */
  enterPhase(next: TaskRunTerminalPhase): boolean {
    if (this.phase === "running") {
      this.phase = next;
      return true;
    }
    // Already terminal: only the limit stop may upgrade a natural-summary phase,
    // because it is the more specific description of how the run ended (the
    // subagent called `begin_summary`, then exhausted the budget before the run
    // closed). Everything else is a no-op.
    if (this.phase === "summary" && next === "limit") {
      this.phase = "limit";
      return true;
    }
    return false;
  }
}

type Registry = Map<string, TaskRunState>;

const registries = new WeakMap<ManagedAgent, Registry>();

function registryFor(parentManaged: ManagedAgent): Registry {
  let registry = registries.get(parentManaged);
  if (!registry) {
    registry = new Map();
    registries.set(parentManaged, registry);
  }
  return registry;
}

/** Get the state machine for a task call, if one was registered. */
export function getTaskRunState(parentManaged: ManagedAgent, toolCallId: string): TaskRunState | undefined {
  return registryFor(parentManaged).get(toolCallId);
}

/** Register (or fetch) the state machine for a task call in the `running` phase. */
export function beginTaskRun(parentManaged: ManagedAgent, toolCallId: string): TaskRunState {
  const registry = registryFor(parentManaged);
  const existing = registry.get(toolCallId);
  if (existing) return existing;
  const state = new TaskRunState(toolCallId);
  registry.set(toolCallId, state);
  return state;
}

/**
 * Move a task to its terminal phase (`summary` | `limit`). Returns true when this
 * call performed the transition (callers emit telemetry only then).
 */
export function enterTaskPhase(parentManaged: ManagedAgent, toolCallId: string, phase: TaskRunTerminalPhase): boolean {
  if (!toolCallId) return false;
  return beginTaskRun(parentManaged, toolCallId).enterPhase(phase);
}

/**
 * Move a task to the `summary` phase (the subagent is writing its own report).
 * Kept as the named entry point for the `begin_summary` call site.
 */
export function enterTaskSummaryPhase(parentManaged: ManagedAgent, toolCallId: string): boolean {
  return enterTaskPhase(parentManaged, toolCallId, "summary");
}

/** Move a task to the `limit` phase (budget cutoff; report comes from the fallback). */
export function enterTaskLimitPhase(parentManaged: ManagedAgent, toolCallId: string): boolean {
  return enterTaskPhase(parentManaged, toolCallId, "limit");
}

/** Read the current phase (default `running` for unknown tasks). */
export function readTaskRunPhase(parentManaged: ManagedAgent, toolCallId: string | undefined): TaskRunPhase {
  if (!toolCallId) return "running";
  return registryFor(parentManaged).get(toolCallId)?.phase ?? "running";
}

/** Drop finished bookkeeping (per task, or all tasks of the parent). */
export function clearTaskRuns(parentManaged: ManagedAgent, toolCallId?: string): void {
  const registry = registries.get(parentManaged);
  if (!registry) return;
  if (toolCallId) registry.delete(toolCallId);
  else registry.clear();
}
