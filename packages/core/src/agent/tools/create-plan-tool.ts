import { z } from "zod";

import { formatPlanSummary } from "../plan/plan-summary.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

import type { PlanModeController } from "../plan/plan-mode-controller.js";

const structuredPlanInputSchema = z.object({
  goal: z.string().min(1).describe("One-sentence outcome of the plan"),
  steps: z.array(z.string().min(3)).min(1).max(30).describe("Numbered implementation steps (plain text, ordered)"),
  key_files: z.array(z.string()).optional().describe("Important file paths the plan will touch or rely on"),
  risks: z.string().optional().describe("Brief risks or trade-offs"),
  verification: z.string().optional().describe("How to verify success after execution"),
  mermaid: z.string().optional().describe("Optional mermaid diagram body (without fences)"),
});

const planToolOutputSchema = z.object({
  ok: z.boolean(),
  phase: z.string(),
  stepCount: z.number().int().nonnegative(),
  message: z.string(),
  summary: z.string().optional(),
  planFilePath: z.string().nullable().optional(),
  error: z.string().optional(),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export type CreatePlanToolDeps = {
  getPlanMode: () => PlanModeController;
};

function createPlanAuthoringTool(name: "create_plan" | "update_plan", deps: CreatePlanToolDeps) {
  const isUpdate = name === "update_plan";
  return defineServerTool({
    name,
    description: isUpdate
      ? `Update the current plan while in plan mode (review/planning). Replaces the plan artifact, overwrites the plan file, and refreshes the static summary. Prefer this over rewriting ## Plan in chat.`
      : `Create a structured implementation plan while in plan mode. Auto-saves under .agents/plans/ and shows a static summary for user review. Prefer this over free-form ## Plan markdown when possible.`,
    inputSchema: structuredPlanInputSchema,
    outputSchema: planToolOutputSchema,
    execute: async (input) => {
      return withDuration(async () => {
        const planMode = deps.getPlanMode();
        const result = await planMode.applyStructuredPlan({
          goal: input.goal,
          steps: input.steps,
          keyFiles: input.key_files,
          risks: input.risks,
          verification: input.verification,
          mermaid: input.mermaid,
        });

        if (!result.ok) {
          return {
            ok: false,
            phase: planMode.getPhase(),
            stepCount: 0,
            message: result.error ?? "Failed to apply plan",
            error: result.error,
          };
        }

        const state = planMode.getState();
        const summary = formatPlanSummary({
          path: state.planFilePath,
          goal: input.goal,
          steps: state.steps,
        });
        const phase = state.phase;
        const hint = isUpdate
          ? "Updated. Still in review — user runs /plan execute to Build."
          : "Ready for review — user runs /plan execute to Build.";

        return {
          ok: true,
          phase,
          stepCount: result.stepCount ?? 0,
          planFilePath: state.planFilePath,
          summary,
          message: `${hint}\n\n${summary}`,
        };
      });
    },
    toModelOutput({ output }) {
      if (!output.ok) {
        return [{ type: "text" as const, content: `Plan tool error: ${output.error ?? output.message}` }];
      }
      const body = output.summary?.trim() || output.message;
      return [{ type: "text" as const, content: body }];
    },
  });
}

export const createCreatePlanTool = (deps: CreatePlanToolDeps) => createPlanAuthoringTool("create_plan", deps);

export const createUpdatePlanTool = (deps: CreatePlanToolDeps) => createPlanAuthoringTool("update_plan", deps);

const completePlanOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

/** End plan mode after forced retrospective. */
export const createCompletePlanTool = (deps: CreatePlanToolDeps) => {
  return defineServerTool({
    name: "complete_plan",
    description: `End the current plan lifecycle after the retrospective. Only use in retro phase when you have summarized done / deviations / verification. Exits plan mode.`,
    inputSchema: z.object({
      note: z.string().optional().describe("Optional one-line note about the retrospective outcome"),
    }),
    outputSchema: completePlanOutputSchema,
    execute: async (input) => {
      return withDuration(async () => {
        const planMode = deps.getPlanMode();
        if (planMode.getPhase() !== "retro") {
          return {
            ok: false,
            message: `complete_plan only works in retro phase (current: ${planMode.getPhase()})`,
            error: `complete_plan only works in retro phase (current: ${planMode.getPhase()})`,
          };
        }
        const result = planMode.complete();
        if (!result.ok) {
          return { ok: false, message: result.error ?? "Failed to complete plan", error: result.error };
        }
        const note = input.note?.trim();
        return {
          ok: true,
          message: note ? `Plan complete — ${note}` : "Plan complete — plan mode off",
        };
      });
    },
    toModelOutput({ output }) {
      return [{ type: "text" as const, content: output.message }];
    },
  });
};
