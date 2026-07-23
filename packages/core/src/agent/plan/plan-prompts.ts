import type { PlanModePhase } from "./plan-mode-controller.js";

/** Dynamic turn-context block while exploring (read-only). */
export function buildPlanModePlanningPrompt(): string {
  return [
    '<plan_mode phase="planning">',
    "You are in **plan mode** (read-only planning).",
    "",
    "Goals:",
    "- Understand the codebase and requirements before proposing changes.",
    "- Do not edit files, run mutating commands, or claim you mutated the workspace.",
    "",
    "Exploration:",
    "- Prefer the `task` tool to spawn parallel read-only subagents for codebase research.",
    "- You may also use read tools (`read_file`, `grep`, `glob`, `list_file`, `tree`) and allowlisted `run_command` (e.g. git status/log/diff, ls, cat).",
    "- If requirements are ambiguous, call `ask_user` with a short clarifying question (prefer numbered options) before finalizing the plan.",
    "- Skipping answers is fine if the user continues without answering — do not block forever.",
    "",
    "When ready, call the `create_plan` tool with:",
    "- goal, ordered steps, key_files, risks, verification (optional mermaid).",
    "You may also output a `## Plan` markdown section as a fallback; prefer `create_plan`.",
    "Use `update_plan` to revise after feedback.",
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
    "Revise with `update_plan` (preferred) or a new `## Plan` section if the user asks.",
    "Prefer `task` for any further read-only research before revising.",
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
