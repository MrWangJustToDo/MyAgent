import { extractDoneSteps, extractPlan, type PlanStep } from "./extract-plan.js";
import { formatStructuredPlanMarkdown, stepsFromTexts, type StructuredPlanInput } from "./plan-format.js";
import { buildPlanExecuteSteerMessage } from "./plan-prompts.js";
import { savePlanFile } from "./plan-store.js";
import { extractGoalFromPlanMarkdown } from "./plan-summary.js";

import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { TodoManager } from "../todo-manager/todo-manager.js";

export type PlanModePhase = "off" | "planning" | "ready" | "executing" | "retro";

/** Todo set title used when plan steps are seeded into {@link TodoManager}. */
export const PLAN_TODO_TITLE = "Plan";

export interface PlanModeState {
  phase: PlanModePhase;
  planMarkdown: string | null;
  steps: PlanStep[];
  enabledAt: number | null;
  /** Plan steps were written to TodoManager (title {@link PLAN_TODO_TITLE}). */
  todosSeeded: boolean;
  /** Ready phase skipped seeding because unrelated todos already exist. */
  preservedExistingTodos: boolean;
  /** Relative path under `.agents/plans/` when auto-persisted or loaded. */
  planFilePath: string | null;
}

export interface PlanModeControllerDeps {
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
  getTodoManager: () => TodoManager | null;
  /** Invalidate runner / notify UI when phase changes. */
  onPhaseChange?: () => void;
  /** Optional steer when entering retro (e.g. send chat message). */
  onEnterRetro?: (state: PlanModeState) => void;
}

export interface BeginPlanExecutionResult {
  ok: boolean;
  error?: string;
  /** User message to send when starting execution. */
  steerMessage?: string;
  /** Steer was queued because the agent is still running. */
  queued?: boolean;
  /** Execute replaced an unrelated todo list with plan steps. */
  replacedExistingTodos?: boolean;
}

export interface ApplyPlanResult {
  ok: boolean;
  error?: string;
  stepCount?: number;
  planFilePath?: string | null;
  summary?: string;
}

/**
 * Owns plan-mode phase, last plan artifact, persistence path, and TodoManager seeding / DONE sync.
 */
export class PlanModeController {
  private phase: PlanModePhase = "off";
  private planMarkdown: string | null = null;
  private steps: PlanStep[] = [];
  private enabledAt: number | null = null;
  private todosSeeded = false;
  private preservedExistingTodos = false;
  private planFilePath: string | null = null;
  private todoUnsub: (() => void) | null = null;

  constructor(private readonly deps: PlanModeControllerDeps) {}

  getState(): PlanModeState {
    return {
      phase: this.phase,
      planMarkdown: this.planMarkdown,
      steps: [...this.steps],
      enabledAt: this.enabledAt,
      todosSeeded: this.todosSeeded,
      preservedExistingTodos: this.preservedExistingTodos,
      planFilePath: this.planFilePath,
    };
  }

  getPhase(): PlanModePhase {
    return this.phase;
  }

  /** True while mutate tools / MCP must be hidden or blocked. */
  isRestrictingTools(): boolean {
    return this.phase === "planning" || this.phase === "ready";
  }

  /**
   * Auto-approve pending `needsApproval` tools only while actively building a seeded plan.
   * Requires both `executing` and `todosSeeded` so a stuck phase alone cannot bypass approval.
   */
  shouldAutoApproveTools(): boolean {
    return this.phase === "executing" && this.todosSeeded;
  }

  /**
   * Hydrate controller from session persistence without clearing TodoManager.
   * Call after todos have been restored. Does not emit plan lifecycle enter/exit events.
   */
  restoreState(snapshot: PlanModeState | null | undefined): void {
    this.detachTodoListener();

    if (!snapshot || snapshot.phase === "off") {
      this.phase = "off";
      this.planMarkdown = null;
      this.steps = [];
      this.enabledAt = null;
      this.todosSeeded = false;
      this.preservedExistingTodos = false;
      this.planFilePath = null;
      this.deps.onPhaseChange?.();
      return;
    }

    this.phase = snapshot.phase;
    this.planMarkdown = snapshot.planMarkdown;
    this.steps = [...snapshot.steps];
    this.enabledAt = snapshot.enabledAt;
    this.todosSeeded = snapshot.todosSeeded;
    this.preservedExistingTodos = snapshot.preservedExistingTodos;
    this.planFilePath = snapshot.planFilePath;

    if (this.phase === "executing" || this.phase === "retro") {
      this.setPlanTodoAutoClear(false);
      const todoManager = this.deps.getTodoManager();
      if (this.todosSeeded) {
        todoManager?.setPlanBound(true);
      }
      if (this.phase === "executing") {
        this.attachTodoListener();
        this.maybeEnterRetro();
      }
    } else if (this.phase === "ready" || this.phase === "planning") {
      // Keep plan-bound todos from auto-clearing while reviewing / planning.
      if (this.todosSeeded) {
        this.setPlanTodoAutoClear(false);
        this.deps.getTodoManager()?.setPlanBound(true);
      }
    }

    this.deps.onPhaseChange?.();
  }

  enable(): void {
    if (this.phase !== "off") return;
    this.phase = "planning";
    this.enabledAt = Date.now();
    this.planMarkdown = null;
    this.steps = [];
    this.todosSeeded = false;
    this.preservedExistingTodos = false;
    this.planFilePath = null;
    this.deps.emitEvent("plan:enter", { phase: this.phase });
    this.deps.onPhaseChange?.();
  }

  disable(): void {
    if (this.phase === "off") return;
    this.detachTodoListener();
    this.clearPlanTodos();
    this.phase = "off";
    this.planMarkdown = null;
    this.steps = [];
    this.enabledAt = null;
    this.todosSeeded = false;
    this.preservedExistingTodos = false;
    this.planFilePath = null;
    this.deps.emitEvent("plan:exit", { phase: this.phase });
    this.deps.onPhaseChange?.();
  }

  /**
   * Finish retro (or abort lifecycle) and exit plan mode.
   * Emits `plan:complete` then clears via {@link disable}.
   */
  complete(): { ok: boolean; error?: string } {
    if (this.phase === "off") {
      return { ok: false, error: "Plan mode is already off" };
    }
    const fromPhase = this.phase;
    this.deps.emitEvent("plan:complete", {
      phase: fromPhase,
      planFilePath: this.planFilePath,
      stepCount: this.steps.length,
    });
    this.disable();
    return { ok: true };
  }

  toggle(): PlanModePhase {
    if (this.phase === "off") {
      this.enable();
    } else {
      this.disable();
    }
    return this.phase;
  }

  /** Stop execution but keep the approved plan in `ready` (read-only). */
  cancelExecution(): boolean {
    if (this.phase !== "executing" && this.phase !== "retro") return false;
    this.detachTodoListener();
    this.setPlanTodoAutoClear(false);
    this.phase = "ready";
    this.deps.emitEvent("plan:cancel-execution", {
      phase: this.phase,
      stepCount: this.steps.length,
    });
    this.deps.onPhaseChange?.();
    return true;
  }

  beginExecution(): BeginPlanExecutionResult {
    if (this.phase !== "ready") {
      return {
        ok: false,
        error:
          this.phase === "planning"
            ? "No plan ready yet — wait for create_plan (or a ## Plan section)"
            : `Cannot execute from phase "${this.phase}"`,
      };
    }

    const { replacedExisting } = this.seedTodosFromSteps({ force: true });
    this.preservedExistingTodos = false;
    this.phase = "executing";
    this.setPlanTodoAutoClear(false);
    this.attachTodoListener();
    this.deps.emitEvent("plan:execute", {
      phase: this.phase,
      stepCount: this.steps.length,
      replacedExistingTodos: replacedExisting,
      planFilePath: this.planFilePath,
    });
    this.deps.onPhaseChange?.();
    this.maybeEnterRetro();

    return {
      ok: true,
      steerMessage: buildPlanExecuteSteerMessage(this.planMarkdown, this.planFilePath),
      replacedExistingTodos: replacedExisting,
    };
  }

  /**
   * Apply a structured plan from `create_plan` / `update_plan`.
   * Transitions `planning` → `ready` when steps are present; auto-persists to `.agents/plans/`.
   */
  async applyStructuredPlan(input: StructuredPlanInput): Promise<ApplyPlanResult> {
    if (this.phase !== "planning" && this.phase !== "ready") {
      return {
        ok: false,
        error: `Plan tools only work in planning/ready (current: ${this.phase})`,
      };
    }

    const steps = stepsFromTexts(input.steps);
    if (steps.length === 0) {
      return { ok: false, error: "Plan must include at least one step" };
    }
    if (!input.goal.trim()) {
      return { ok: false, error: "Plan goal is required" };
    }

    const planMarkdown = formatStructuredPlanMarkdown({ ...input, steps: steps.map((s) => s.text) });
    return this.applyPlanArtifact(planMarkdown, steps, { nameHint: input.goal });
  }

  /**
   * After an assistant turn: extract plan in planning, or apply [DONE:n] while executing.
   */
  onAssistantText(text: string): void {
    if (!text.trim()) return;

    if (this.phase === "planning" || this.phase === "ready") {
      const extracted = extractPlan(text);
      if (!extracted) return;
      void this.applyPlanArtifact(extracted.planMarkdown, extracted.steps);
      return;
    }

    if (this.phase === "executing") {
      this.applyDoneMarkers(text);
      this.maybeEnterRetro();
    }
  }

  /**
   * Shared path for tool + markdown plan artifacts.
   * Auto-persists under `.agents/plans/` (overwrites active path when set).
   */
  async applyPlanArtifact(
    planMarkdown: string,
    steps: PlanStep[],
    options?: { nameHint?: string; existingRelativePath?: string }
  ): Promise<ApplyPlanResult> {
    if (steps.length === 0) {
      return { ok: false, error: "Plan must include at least one step" };
    }
    if (this.phase !== "planning" && this.phase !== "ready") {
      return { ok: false, error: `Cannot apply plan while phase is "${this.phase}"` };
    }

    this.planMarkdown = planMarkdown;
    this.steps = steps;
    const { seeded, skippedDueToExisting } = this.seedTodosFromSteps({ force: false });
    this.preservedExistingTodos = skippedDueToExisting;

    const persistPath = options?.existingRelativePath ?? this.planFilePath ?? undefined;
    const nameHint = options?.nameHint ?? extractGoalFromPlanMarkdown(planMarkdown);
    try {
      const { path } = await savePlanFile(planMarkdown, nameHint, {
        existingRelativePath: persistPath,
      });
      this.planFilePath = path;
    } catch {
      // Non-fatal: keep in-memory plan even if disk write fails
    }

    if (this.phase === "planning") {
      this.phase = "ready";
      this.deps.emitEvent("plan:ready", {
        phase: this.phase,
        stepCount: this.steps.length,
        preservedExistingTodos: skippedDueToExisting,
        todosSeeded: seeded,
        planFilePath: this.planFilePath,
      });
      this.deps.onPhaseChange?.();
    } else {
      this.deps.onPhaseChange?.();
    }

    return {
      ok: true,
      stepCount: this.steps.length,
      planFilePath: this.planFilePath,
    };
  }

  /**
   * Load markdown into plan state (enables planning first if off).
   * Used by `/plan load`. Sets {@link planFilePath} when `relativePath` is provided.
   */
  async loadPlanMarkdown(markdown: string, options?: { relativePath?: string }): Promise<ApplyPlanResult> {
    if (this.phase === "off") {
      this.enable();
    }
    if (this.phase !== "planning" && this.phase !== "ready") {
      return { ok: false, error: `Cannot load plan while phase is "${this.phase}"` };
    }

    const extracted = extractPlan(markdown);
    if (!extracted) {
      return { ok: false, error: "File does not contain a ## Plan section with numbered steps" };
    }

    return this.applyPlanArtifact(extracted.planMarkdown, extracted.steps, {
      existingRelativePath: options?.relativePath,
      nameHint: extractGoalFromPlanMarkdown(markdown),
    });
  }

  /** Record path after explicit `/plan save` (may rename). */
  setPlanFilePath(path: string): void {
    this.planFilePath = path;
  }

  /** @returns seed outcome for ready vs execute flows */
  private seedTodosFromSteps(options: { force: boolean }): {
    seeded: boolean;
    skippedDueToExisting: boolean;
    replacedExisting: boolean;
  } {
    const none = { seeded: false, skippedDueToExisting: false, replacedExisting: false };
    const todoManager = this.deps.getTodoManager();
    if (!todoManager || this.steps.length === 0) return none;

    if (!options.force && todoManager.hasTodos() && todoManager.getTitle() !== PLAN_TODO_TITLE) {
      return { seeded: false, skippedDueToExisting: true, replacedExisting: false };
    }

    const replacedExisting = options.force && todoManager.hasTodos() && todoManager.getTitle() !== PLAN_TODO_TITLE;

    todoManager.update(
      this.steps.map((s) => ({
        content: s.text,
        status: "pending" as const,
        priority: "medium" as const,
      })),
      PLAN_TODO_TITLE
    );
    todoManager.setPlanBound(true);
    this.todosSeeded = true;
    if (replacedExisting) {
      this.deps.emitEvent("plan:todo-replaced", { stepCount: this.steps.length });
    }
    return { seeded: true, skippedDueToExisting: false, replacedExisting };
  }

  private applyDoneMarkers(text: string): void {
    const done = extractDoneSteps(text);
    if (done.length === 0) return;

    const todoManager = this.deps.getTodoManager();
    if (!todoManager) return;

    const items = todoManager.getItems();
    if (items.length === 0) return;

    const title = todoManager.getTitle() ?? PLAN_TODO_TITLE;
    const doneSet = new Set(done);
    todoManager.update(
      items.map((item, index) => {
        const stepNum = index + 1;
        const completed = item.status === "completed" || doneSet.has(stepNum);
        return {
          content: item.content,
          status: completed ? ("completed" as const) : item.status,
          priority: item.priority,
        };
      }),
      title
    );
  }

  private maybeEnterRetro(): void {
    if (this.phase !== "executing") return;
    if (!this.todosSeeded) return;
    const todoManager = this.deps.getTodoManager();
    if (!todoManager || todoManager.getTitle() !== PLAN_TODO_TITLE) return;
    if (!todoManager.isAllCompleted()) return;

    this.phase = "retro";
    this.deps.emitEvent("plan:retro", {
      phase: this.phase,
      stepCount: this.steps.length,
      planFilePath: this.planFilePath,
    });
    this.deps.onPhaseChange?.();
    this.deps.onEnterRetro?.(this.getState());
  }

  private attachTodoListener(): void {
    this.detachTodoListener();
    const todoManager = this.deps.getTodoManager();
    if (!todoManager) return;
    this.todoUnsub = todoManager.onChange(() => {
      this.maybeEnterRetro();
    });
  }

  private detachTodoListener(): void {
    this.todoUnsub?.();
    this.todoUnsub = null;
  }

  private clearPlanTodos(): void {
    const todoManager = this.deps.getTodoManager();
    if (!todoManager) return;
    this.setPlanTodoAutoClear(true);
    if (this.todosSeeded && todoManager.getTitle() === PLAN_TODO_TITLE) {
      todoManager.clear();
    } else if (this.todosSeeded) {
      todoManager.setPlanBound(false);
    }
    this.todosSeeded = false;
  }

  private setPlanTodoAutoClear(enabled: boolean): void {
    this.deps.getTodoManager()?.setAutoClearEnabled(enabled);
  }
}
