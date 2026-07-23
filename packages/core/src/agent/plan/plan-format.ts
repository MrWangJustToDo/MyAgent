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

export function stepsFromTexts(texts: string[]): PlanStep[] {
  return texts
    .map((text) => text.trim())
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
  input.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.trim()}`);
  });
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
