import { z } from "zod";

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
      ? `Update the current plan while in plan mode (ready or planning). Replaces the previous plan artifact and steps. Prefer this over rewriting ## Plan in chat.`
      : `Create a structured implementation plan while in plan mode. Call this when exploration is done and you are ready for user review. Prefer this over free-form ## Plan markdown when possible.`,
    inputSchema: structuredPlanInputSchema,
    outputSchema: planToolOutputSchema,
    execute: async (input) => {
      return withDuration(async () => {
        const planMode = deps.getPlanMode();
        const result = planMode.applyStructuredPlan({
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

        const phase = planMode.getPhase();
        return {
          ok: true,
          phase,
          stepCount: result.stepCount ?? 0,
          message: isUpdate
            ? `Plan updated (${result.stepCount} steps). Waiting for /plan execute.`
            : `Plan ready (${result.stepCount} steps). Waiting for /plan execute.`,
        };
      });
    },
    toModelOutput({ output }) {
      if (!output.ok) {
        return [{ type: "text" as const, content: `Plan tool error: ${output.error ?? output.message}` }];
      }
      return [{ type: "text" as const, content: output.message }];
    },
  });
}

export const createCreatePlanTool = (deps: CreatePlanToolDeps) => createPlanAuthoringTool("create_plan", deps);

export const createUpdatePlanTool = (deps: CreatePlanToolDeps) => createPlanAuthoringTool("update_plan", deps);
