/**
 * Per-task run-phase state machine — one {@link TaskRunState} instance per
 * `task` tool call, owned by the parent agent.
 *
 * Phases are one-way and authoritative (no message inference):
 * - `running`  — the underlying subagent is exploring (its running/thinking/
 *                responding statuses fold into this single task-level phase)
 * - `summary`  — the subagent called `begin_summary`, OR the iteration-limit
 *                progress-summary fallback started generating its report
 *
 * Registries are keyed by parent ManagedAgent (WeakMap) and indexed by
 * parentTaskToolCallId, mirroring how the UI addresses tasks.
 */

import type { ManagedAgent } from "../../runtime-types/hosts.js";

export type TaskRunPhase = "running" | "summary";

export class TaskRunState {
  /** Current phase — one-way running → summary. */
  phase: TaskRunPhase = "running";

  constructor(readonly toolCallId: string) {}

  enterSummary(): boolean {
    if (this.phase === "summary") return false;
    this.phase = "summary";
    return true;
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
 * Move a task to the `summary` phase. Returns true when this call performed
 * the transition (callers emit telemetry only then).
 */
export function enterTaskSummaryPhase(parentManaged: ManagedAgent, toolCallId: string): boolean {
  if (!toolCallId) return false;
  return beginTaskRun(parentManaged, toolCallId).enterSummary();
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
