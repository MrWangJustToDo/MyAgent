import type { PlanModePhase } from "./plan-mode-controller.js";

/** Dynamic turn-context block while exploring (read-only). */
export function buildPlanModePlanningPrompt(): string {
  return [
    '<plan_mode phase="planning">',
    "You are in **plan mode** (read-only).",
    "Explore with read tools and safe shell commands only. Do not edit files or claim you have mutated the workspace.",
    "When ready, output a plan under a `## Plan` heading with numbered steps (1. 2. 3.).",
    "Include a mermaid flowchart when it clarifies sequencing or dependencies.",
    "</plan_mode>",
  ].join("\n");
}

/** Dynamic turn-context block while executing an approved plan. */
export function buildPlanModeExecutingPrompt(planMarkdown: string | null): string {
  const parts = [
    '<plan_mode phase="executing">',
    "Execute the approved plan step-by-step. Update the todo list as you progress.",
    "Do not expand scope without asking the user.",
    "Mark completed steps via the `todo` tool (preferred) or `[DONE:n]` markers (1-based).",
  ];
  if (planMarkdown?.trim()) {
    parts.push("", "Approved plan:", planMarkdown.trim());
  }
  parts.push("</plan_mode>");
  return parts.join("\n");
}

/** Short user steer when `/plan execute` starts a run. */
export function buildPlanExecuteSteerMessage(planMarkdown: string | null): string {
  if (planMarkdown?.trim()) {
    return [
      "Execute the approved plan below step-by-step. Update todos as you go. Do not expand scope without asking.",
      "",
      planMarkdown.trim(),
    ].join("\n");
  }
  return "Execute the approved plan step-by-step. Update todos as you go. Do not expand scope without asking.";
}

/** Optional prompt fragment for `ready` (still read-only until execute). */
export function buildPlanModeReadyPrompt(planMarkdown: string | null): string {
  const parts = [
    '<plan_mode phase="ready">',
    "A plan is ready. Stay read-only until the user runs `/plan execute`.",
    "You may revise the plan under `## Plan` if the user asks.",
  ];
  if (planMarkdown?.trim()) {
    parts.push("", "Current plan:", planMarkdown.trim());
  }
  parts.push("</plan_mode>");
  return parts.join("\n");
}

export function buildPlanModePrompt(phase: PlanModePhase, planMarkdown: string | null): string | undefined {
  switch (phase) {
    case "planning":
      return buildPlanModePlanningPrompt();
    case "ready":
      return buildPlanModeReadyPrompt(planMarkdown);
    case "executing":
      return buildPlanModeExecutingPrompt(planMarkdown);
    default:
      return undefined;
  }
}
