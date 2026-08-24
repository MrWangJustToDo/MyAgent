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
 *
 * Scheduling is a rolling FIFO window: every registered run is accepted, and
 * runs beyond {@link MAX_ACTIVE_TASK_PREFORKS} queue until a slot frees — so
 * the 5th+ task starts as soon as an earlier one finishes, not serially.
 */

import type { ManagedAgent } from "../../runtime-types/hosts.js";
import type { SubagentResult } from "./types.js";

/** Max subagent runs executing LLM loops concurrently per parent. */
export const MAX_ACTIVE_TASK_PREFORKS = 4;

function cancelledStubResult(): SubagentResult {
  return {
    subagentId: "",
    output: "[Task cancelled.]",
    truncated: false,
    iterations: 0,
    durationMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    reachedLimit: false,
    incomplete: true,
    aborted: true,
  };
}

interface PreforkEntry {
  /** "queued" until its gate opens, "running" once the factory may proceed. */
  state: "queued" | "running";
  /** Whether this entry currently occupies a concurrency slot. */
  occupying: boolean;
  aborted: boolean;
  gate: Promise<void>;
  openGate: () => void;
  abortHandle: () => void;
  promise: Promise<SubagentResult>;
}

export class TaskPreforkCoordinator {
  private readonly entries = new Map<string, PreforkEntry>();
  private readonly waiting = new Set<PreforkEntry>();
  private active = 0;

  get size(): number {
    return this.entries.size;
  }

  /** Runs currently holding a concurrency slot (excludes queued runs). */
  get activeCount(): number {
    return this.active;
  }

  has(toolCallId: string): boolean {
    return this.entries.has(toolCallId);
  }

  /**
   * Register a background run. Duplicate ids are ignored (returns true);
   * beyond the concurrency cap runs queue FIFO and roll forward as slots free.
   *
   * @param abortHandle cancels the run (controller) — safe in any state.
   * @param onRunStart fires when the run actually acquires a slot (not while queued).
   */
  start(
    toolCallId: string,
    abortHandle: () => void,
    factory: () => Promise<SubagentResult>,
    onRunStart?: () => void
  ): boolean {
    if (this.entries.has(toolCallId)) return true;

    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const entry: PreforkEntry = {
      state: "queued",
      occupying: false,
      aborted: false,
      gate,
      openGate,
      abortHandle,
      promise: undefined!,
    };
    entry.promise = this.drive(entry, factory, onRunStart);
    this.entries.set(toolCallId, entry);

    if (this.active < MAX_ACTIVE_TASK_PREFORKS) {
      this.admit(entry);
    } else {
      this.waiting.add(entry);
    }
    return true;
  }

  /**
   * Join a registered run and drop bookkeeping. Returns null when the call was
   * not registered (caller runs it serially).
   */
  async join(toolCallId: string): Promise<SubagentResult | null> {
    const entry = this.entries.get(toolCallId);
    if (!entry) return null;
    this.entries.delete(toolCallId);
    return entry.promise;
  }

  /** Cancel every registered run (queued ones settle with a stub) and reset. */
  abortAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.aborted) continue;
      entry.aborted = true;
      if (!entry.occupying) {
        // Never started — settle immediately without consuming a slot.
        this.waiting.delete(entry);
        entry.openGate();
      }
    }
    for (const entry of this.entries.values()) {
      try {
        entry.abortHandle();
      } catch {
        // Cleanup must never mask the original failure.
      }
    }
    this.entries.clear();
  }

  private admit(entry: PreforkEntry): void {
    this.waiting.delete(entry);
    entry.occupying = true;
    this.active += 1;
    entry.openGate();
  }

  private async drive(
    entry: PreforkEntry,
    factory: () => Promise<SubagentResult>,
    onRunStart?: () => void
  ): Promise<SubagentResult> {
    await entry.gate;
    if (entry.aborted) {
      if (entry.occupying) {
        entry.occupying = false;
        this.active -= 1;
        this.promote();
      }
      return cancelledStubResult();
    }
    entry.state = "running";
    onRunStart?.();
    try {
      return await factory();
    } finally {
      entry.occupying = false;
      this.active -= 1;
      this.promote();
    }
  }

  private promote(): void {
    for (const candidate of this.waiting) {
      if (candidate.aborted) continue;
      this.admit(candidate);
      return;
    }
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
