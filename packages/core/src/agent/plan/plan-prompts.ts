import type { PlanModePhase } from "./plan-mode-controller.js";

/** Dynamic turn-context block while exploring (read-only). */
export function buildPlanModePlanningPrompt(): string {
  return [
    '<plan_mode phase="planning">',
    "You are in **plan mode** — exploring (read-only). Same idea as Cursor Plan: research first, then produce a reviewable plan.",
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
    "The plan is auto-saved under `.agents/plans/` and a static summary (path + steps) is shown — prefer that over a long chat overview.",
    "You may also output a `## Plan` markdown section as a fallback; prefer `create_plan`.",
    "Use `update_plan` to revise after feedback.",
    "</plan_mode>",
  ].join("\n");
}

/** Dynamic turn-context block while executing an approved plan. */
export function buildPlanModeExecutingPrompt(planMarkdown: string | null, planFilePath?: string | null): string {
  const parts = [
    '<plan_mode phase="executing">',
    "You are **building** the approved plan (Cursor Build). Execute step-by-step. Update the todo list as you progress.",
    "Do not expand scope without asking the user.",
    "Mark completed steps via the `todo` tool (preferred) or `[DONE:n]` markers (1-based).",
    "When all plan todos are done, you will enter a forced retrospective — do not skip ahead to unrelated work.",
  ];
  if (planFilePath?.trim()) {
    parts.push(`Plan file: \`${planFilePath.trim()}\``);
  }
  if (planMarkdown?.trim()) {
    parts.push("", "Approved plan:", planMarkdown.trim());
  }
  parts.push("</plan_mode>");
  return parts.join("\n");
}

/** Short user steer when `/plan execute` starts a run. */
export function buildPlanExecuteSteerMessage(planMarkdown: string | null, planFilePath?: string | null): string {
  const header = [
    "Build the approved plan step-by-step (you are now in building phase). Update todos as you go. Do not expand scope without asking.",
  ];
  if (planFilePath?.trim()) {
    header.push(`Plan file: \`${planFilePath.trim()}\``);
  }
  if (planMarkdown?.trim()) {
    return [...header, "", planMarkdown.trim()].join("\n");
  }
  return header.join("\n");
}

/** Optional prompt fragment for `ready` (still read-only until execute). */
export function buildPlanModeReadyPrompt(planMarkdown: string | null, planFilePath?: string | null): string {
  const parts = [
    '<plan_mode phase="ready">',
    "A plan is ready for **review** (still read-only). Stay read-only until the user runs `/plan execute` (Build).",
    "Revise with `update_plan` (preferred) or a new `## Plan` section if the user asks — updates overwrite the plan file.",
    "Prefer `task` for any further read-only research before revising.",
    "Do not replace the plan summary with a vague overview — the plan file and step list are the source of truth.",
  ];
  if (planFilePath?.trim()) {
    parts.push(`Plan file: \`${planFilePath.trim()}\``);
  }
  if (planMarkdown?.trim()) {
    parts.push("", "Current plan:", planMarkdown.trim());
  }
  parts.push("</plan_mode>");
  return parts.join("\n");
}

/** Forced retrospective after all plan todos complete. */
export function buildPlanModeRetroPrompt(planMarkdown: string | null, planFilePath?: string | null): string {
  const parts = [
    '<plan_mode phase="retro">',
    "All plan todos are complete. You are in a **forced retrospective** — do not start new feature work.",
    "Review outcomes against the approved plan: what was done, any deviations, and how verification went.",
    "When the retrospective is written, call `complete_plan` (or the user may run `/plan done`) to end plan mode.",
  ];
  if (planFilePath?.trim()) {
    parts.push(`Plan file: \`${planFilePath.trim()}\` — prefer reading it if you need the full text.`);
  }
  if (planMarkdown?.trim()) {
    parts.push("", "Approved plan:", planMarkdown.trim());
  }
  parts.push("</plan_mode>");
  return parts.join("\n");
}

/** Steer message when entering retro (optional chat injection). */
export function buildPlanRetroSteerMessage(planFilePath?: string | null): string {
  const pathLine = planFilePath?.trim() ? ` Plan file: \`${planFilePath.trim()}\`.` : "";
  return `All plan steps are done. Write a short retrospective against the plan (done / deviations / verification), then call \`complete_plan\` to finish plan mode.${pathLine}`;
}

export function buildPlanModePrompt(
  phase: PlanModePhase,
  planMarkdown: string | null,
  planFilePath?: string | null
): string | undefined {
  switch (phase) {
    case "planning":
      return buildPlanModePlanningPrompt();
    case "ready":
      return buildPlanModeReadyPrompt(planMarkdown, planFilePath);
    case "executing":
      return buildPlanModeExecutingPrompt(planMarkdown, planFilePath);
    case "retro":
      return buildPlanModeRetroPrompt(planMarkdown, planFilePath);
    default:
      return undefined;
  }
}
