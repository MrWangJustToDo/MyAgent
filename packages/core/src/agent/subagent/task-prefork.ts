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

import { SUBAGENT_PARENT_RUN_NOTICE } from "./subagent-stop-reason.js";

import type { SubagentResult } from "./types.js";
import type { ManagedAgent } from "../../runtime-types/hosts.js";

/** Max subagent runs executing LLM loops concurrently per parent. */
export const MAX_ACTIVE_TASK_PREFORKS = 4;

function cancelledStubResult(): SubagentResult {
  return {
    subagentId: "",
    // A discard is the run lifecycle moving on — never a user cancel. This used to read
    // `[Task cancelled.]` with no reason at all, which is the same misattribution the
    // notice taxonomy exists to fix, one layer down: the caller had no way to say what
    // happened, so a reader could only assume the operator did it.
    output: SUBAGENT_PARENT_RUN_NOTICE,
    truncated: false,
    iterations: 0,
    // No run happened, so there is no budget to report against the count.
    maxIterations: 0,
    durationMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, billedInputTokens: 0 },
    reachedLimit: false,
    // `incomplete` means "finished, but not cleanly" — `deriveSubagentRunStats` only ever
    // sets it on the `!aborted` path, so a cancel can never carry it.
    //
    // This stub IS reachable: it is the result a discarded QUEUED pre-fork settles to (an
    // admitted one returns its own run's result instead). It is not joined by the tool phase
    // — `abortAll` clears the entry, so a later `join` gets `null` and spawns a fresh
    // subagent — but it is the coordinate's declared shape for "this run was thrown away",
    // so it still has to be honest about why. `incomplete` stays false because it is not
    // cancel-aware: a stale flag here would read as "stalled" rather than "stopped".
    incomplete: false,
    aborted: true,
    stopReason: "parent-run",
  };
}

export type PreforkDiscardCause = "run-start" | "run-finish" | "run-abort" | "run-error";

/** One tool call whose eagerly started run was thrown away. */
export interface PreforkDiscard {
  toolCallId: string;
  cause: PreforkDiscardCause;
  /** Subagents already spawned for the call — aborted by this discard, so orphaned. */
  subagentIds: string[];
}

interface PreforkEntry {
  /** "queued" until its gate opens, "running" once the factory may proceed. */
  state: "queued" | "running";
  /** Whether this entry currently occupies a concurrency slot. */
  occupying: boolean;
  aborted: boolean;
  /**
   * Subagents this entry has spawned so far.
   *
   * Read by {@link TaskPreforkCoordinator.abortAll}'s caller so a discarded pre-fork can
   * report which children it orphaned. Normally one, but the coordinator can be *reused*
   * for the same tool call id when a duplicate `TOOL_CALL_END` arrives for an id whose
   * entry was discarded mid-run — and an abandoned child is exactly what the report
   * exists for.
   */
  spawned: string[];
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
   * Record a subagent spawned by this tool call's run.
   *
   * The runner has the id and the coordinator is the only object that outlives a discarded
   * run, so the record lands here: when {@link abortAll} throws the run away, the caller can
   * say which subagents were orphaned instead of leaving that to be reconstructed from
   * timestamps (which is what an orphan used to look like from the log — a subagent with no
   * binding to the `task` call that spawned it). No-op for an unknown id (the run was never
   * registered, e.g. the serial fallback path).
   */
  recordSpawn(toolCallId: string, subagentId: string): void {
    const entry = this.entries.get(toolCallId);
    if (!entry) return;
    entry.spawned.push(subagentId);
  }

  /**
   * Cancel every registered run (queued ones settle with a stub) and reset.
   *
   * @returns one record per discarded tool call when a cause is given — the tool call id
   * and the subagents that were already spawned for it, so the caller can report the
   * orphan instead of dropping the information on the floor. The coordinator itself stays
   * silent (it has no logger and is deliberately transport-free), and an *accepted* join
   * removes the entry first, so a call that completed normally is never reported.
   */
  abortAll(cause?: PreforkDiscardCause): PreforkDiscard[] {
    const discarded: PreforkDiscard[] = [];
    for (const [toolCallId, entry] of this.entries) {
      if (cause && !entry.aborted) {
        discarded.push({ toolCallId, cause, subagentIds: [...entry.spawned] });
      }
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
    return discarded;
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
      spawned: [],
      gate,
      openGate,
      abortHandle,
      promise: undefined!,
    };
    entry.promise = this.drive(entry, factory, onRunStart);
    this.entries.set(toolCallId, entry);

    // The registry owns this promise for its whole life, but nothing joins it when
    // the run is aborted/queued away (`abortAll` settles the gate, not the promise)
    // — and an unobserved rejection has no global handler, so a failing pre-fork
    // would crash the host process instead of surfacing through the task tool.
    // Attach a no-op catch: `join` still observes the real rejection through
    // `entry.promise`, and this only marks the rejection as handled.
    void entry.promise.catch(() => {});

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

/**
 * Discard every registered pre-fork, and report each one to the log bridge.
 *
 * The one place registered runs may be thrown away, so both producers of a discard go
 * through it: the run boundaries (`onFinish`/`onAbort`/`onError`, which end the possibility
 * that a tool phase arrives to join) and the restart-style recovery path (which ends the
 * attempt that spawned them — see `prepareRestartStyleRetry`).
 *
 * `RUN_STARTED` deliberately does NOT: it fires once per model **iteration**, so a healthy
 * pre-fork started on iteration N and joined right after it would be aborted by iteration
 * N+1's boundary before anything could join it. That is the orphan this contract exists to
 * prevent, and it was introduced by treating the per-iteration event as a per-run one.
 */
export function discardRegisteredPrefork(
  managed: ManagedAgent,
  cause: PreforkDiscardCause,
  emit: (discard: PreforkDiscard) => void = () => {}
): void {
  for (const discard of getTaskPreforkCoordinator(managed).abortAll(cause)) {
    emit(discard);
  }
}
