/**
 * Format structured plan fields into markdown consumed by TodoManager / UI.
 */

import type { PlanStep } from "./extract-plan.js";

export interface StructuredPlanInput {
  goal: string;
  steps: string[];
  keyFiles?: string[];
  risks?: string;
  verification?: string;
  mermaid?: string;
}

/**
 * Strip one or more leading list markers (`1. ` / `2) `) so we do not double-number
 * when the model already includes indices in step text.
 */
export function stripLeadingStepNumber(text: string): string {
  let t = text.trim();
  // Repeat: models sometimes send "1. 1. Define …"
  while (/^\d+[.)]\s+/.test(t)) {
    t = t.replace(/^\d+[.)]\s+/, "").trim();
  }
  return t;
}

export function stepsFromTexts(texts: string[]): PlanStep[] {
  return texts
    .map((text) => stripLeadingStepNumber(text))
    .filter((text) => text.length >= 3)
    .map((text, index) => ({ step: index + 1, text }));
}

/** Build `## Plan` markdown from structured fields. */
export function formatStructuredPlanMarkdown(input: StructuredPlanInput): string {
  const lines: string[] = ["## Plan", "", `**Goal:** ${input.goal.trim()}`, ""];

  if (input.keyFiles && input.keyFiles.length > 0) {
    lines.push("**Key files:**");
    for (const file of input.keyFiles) {
      const trimmed = file.trim();
      if (trimmed) lines.push(`- \`${trimmed}\``);
    }
    lines.push("");
  }

  lines.push("**Steps:**");
  const steps = stepsFromTexts(input.steps);
  for (const step of steps) {
    lines.push(`${step.step}. ${step.text}`);
  }
  lines.push("");

  if (input.risks?.trim()) {
    lines.push("**Risks / trade-offs:**", input.risks.trim(), "");
  }

  if (input.verification?.trim()) {
    lines.push("**Verification:**", input.verification.trim(), "");
  }

  if (input.mermaid?.trim()) {
    lines.push("```mermaid", input.mermaid.trim(), "```", "");
  }

  return lines.join("\n").trim();
}
