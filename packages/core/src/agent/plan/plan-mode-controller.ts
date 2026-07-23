import { extractDoneSteps, extractPlan, type PlanStep } from "./extract-plan.js";
import { formatStructuredPlanMarkdown, stepsFromTexts, type StructuredPlanInput } from "./plan-format.js";
import { buildPlanExecuteSteerMessage } from "./plan-prompts.js";

import type { AgentEventType } from "../../managers/agent-event-bus.js";
import type { TodoManager } from "../todo-manager/todo-manager.js";

export type PlanModePhase = "off" | "planning" | "ready" | "executing";

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
}

export interface PlanModeControllerDeps {
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
  getTodoManager: () => TodoManager | null;
  /** Invalidate runner / notify UI when phase changes. */
  onPhaseChange?: () => void;
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

/**
 * Owns plan-mode phase, last plan artifact, and TodoManager seeding / DONE sync.
 */
export class PlanModeController {
  private phase: PlanModePhase = "off";
  private planMarkdown: string | null = null;
  private steps: PlanStep[] = [];
  private enabledAt: number | null = null;
  private todosSeeded = false;
  private preservedExistingTodos = false;

  constructor(private readonly deps: PlanModeControllerDeps) {}

  getState(): PlanModeState {
    return {
      phase: this.phase,
      planMarkdown: this.planMarkdown,
      steps: [...this.steps],
      enabledAt: this.enabledAt,
      todosSeeded: this.todosSeeded,
      preservedExistingTodos: this.preservedExistingTodos,
    };
  }

  getPhase(): PlanModePhase {
    return this.phase;
  }

  /** True while mutate tools / MCP must be hidden or blocked. */
  isRestrictingTools(): boolean {
    return this.phase === "planning" || this.phase === "ready";
  }

  enable(): void {
    if (this.phase !== "off") return;
    this.phase = "planning";
    this.enabledAt = Date.now();
    this.planMarkdown = null;
    this.steps = [];
    this.todosSeeded = false;
    this.preservedExistingTodos = false;
    this.deps.emitEvent("plan:enter", { phase: this.phase });
    this.deps.onPhaseChange?.();
  }

  disable(): void {
    if (this.phase === "off") return;
    this.clearPlanTodos();
    this.phase = "off";
    this.planMarkdown = null;
    this.steps = [];
    this.enabledAt = null;
    this.todosSeeded = false;
    this.preservedExistingTodos = false;
    this.deps.emitEvent("plan:exit", { phase: this.phase });
    this.deps.onPhaseChange?.();
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
    if (this.phase !== "executing") return false;
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
            ? "No plan ready yet — wait for a ## Plan section"
            : `Cannot execute from phase "${this.phase}"`,
      };
    }

    const { replacedExisting } = this.seedTodosFromSteps({ force: true });
    this.preservedExistingTodos = false;
    this.phase = "executing";
    this.setPlanTodoAutoClear(false);
    this.deps.emitEvent("plan:execute", {
      phase: this.phase,
      stepCount: this.steps.length,
      replacedExistingTodos: replacedExisting,
    });
    this.deps.onPhaseChange?.();

    return {
      ok: true,
      steerMessage: buildPlanExecuteSteerMessage(this.planMarkdown),
      replacedExistingTodos: replacedExisting,
    };
  }

  /**
   * Apply a structured plan from `create_plan` / `update_plan`.
   * Transitions `planning` → `ready` when steps are present.
   */
  applyStructuredPlan(input: StructuredPlanInput): { ok: boolean; error?: string; stepCount?: number } {
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
    this.applyPlanArtifact(planMarkdown, steps);
    return { ok: true, stepCount: this.steps.length };
  }

  /**
   * After an assistant turn: extract plan in planning, or apply [DONE:n] while executing.
   */
  onAssistantText(text: string): void {
    if (!text.trim()) return;

    if (this.phase === "planning" || this.phase === "ready") {
      const extracted = extractPlan(text);
      if (!extracted) return;
      this.applyPlanArtifact(extracted.planMarkdown, extracted.steps);
      return;
    }

    if (this.phase === "executing") {
      this.applyDoneMarkers(text);
    }
  }

  /** Shared path for tool + markdown plan artifacts. */
  applyPlanArtifact(planMarkdown: string, steps: PlanStep[]): void {
    if (steps.length === 0) return;
    if (this.phase !== "planning" && this.phase !== "ready") return;

    this.planMarkdown = planMarkdown;
    this.steps = steps;
    const { seeded, skippedDueToExisting } = this.seedTodosFromSteps({ force: false });
    this.preservedExistingTodos = skippedDueToExisting;

    if (this.phase === "planning") {
      this.phase = "ready";
      this.deps.emitEvent("plan:ready", {
        phase: this.phase,
        stepCount: this.steps.length,
        preservedExistingTodos: skippedDueToExisting,
        todosSeeded: seeded,
      });
      this.deps.onPhaseChange?.();
    } else {
      // Revise while already ready — notify UI without re-emitting plan:ready.
      this.deps.onPhaseChange?.();
    }
  }

  /**
   * Load markdown into plan state (enables planning first if off).
   * Used by `/plan load`.
   */
  loadPlanMarkdown(markdown: string): { ok: boolean; error?: string; stepCount?: number } {
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

    this.applyPlanArtifact(extracted.planMarkdown, extracted.steps);
    return { ok: true, stepCount: this.steps.length };
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

  private clearPlanTodos(): void {
    const todoManager = this.deps.getTodoManager();
    if (!todoManager) return;
    this.setPlanTodoAutoClear(true);
    if (this.todosSeeded && todoManager.getTitle() === PLAN_TODO_TITLE) {
      todoManager.clear();
    }
    this.todosSeeded = false;
  }

  private setPlanTodoAutoClear(enabled: boolean): void {
    this.deps.getTodoManager()?.setAutoClearEnabled(enabled);
  }
}
