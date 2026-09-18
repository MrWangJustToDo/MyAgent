import { getToolPresentation, keepsCompactRow as coreKeepsCompactRow } from "@codent/core";
import chalk from "chalk";

import { COLORS } from "../theme/colors.js";

import type { UiToolState } from "./tool-part.js";

/**
 * Completed tool rows that stay visible in compact display: interactive or
 * structured results (an answer, a checklist, a plan summary) that a row header
 * cannot express. Single source of truth for both the compact projection (the
 * fold decision in `tool-activity-summary`) and the render layer (output block).
 */
export const ALWAYS_VISIBLE_TOOL_NAMES: ReadonlySet<string> = new Set(["ask_user", "todo", "complete_plan"]);

/** Built-in tools that render a detailed output block in full mode only. */
export const DETAILED_OUTPUT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "run_command",
  "get_command_output",
  "kill_command",
  "task",
]);

/**
 * Whether a tool renders a detailed output block in full display.
 *
 * The descriptor wins — a tool that declares `detailed` or `keepRow` always keeps its
 * block, so a newly declared one cannot be missed by the static sets below. Those sets
 * remain as the fallback for a host whose process never created the tools (a remote
 * renderer, before the snapshot catalog is wired into the views).
 */
export function hasDetailedOutputBlock(toolName: string): boolean {
  const present = getToolPresentation(toolName);
  if (present?.detailed || present?.keepRow) return true;
  return ALWAYS_VISIBLE_TOOL_NAMES.has(toolName) || DETAILED_OUTPUT_TOOL_NAMES.has(toolName);
}

/**
 * Whether a tool owns its compact presentation.
 *
 * Core owns this rule — a descriptor that declares `keepRow` (structured result), `clientSide`
 * (the host supplies the result) or `text` (a curated line *is* the row's content) keeps its row.
 * This function must not restate that rule: it previously tested only `text`, so a descriptor with
 * `keepRow` but no renderer — which is what a runtime tool gets when there is no sensible line to
 * render — was judged "folds" here while core judged it "keeps its row", and the two hosts
 * disagreed about the same tool.
 *
 * {@link ALWAYS_VISIBLE_TOOL_NAMES} stays in front as the documented fallback, not as a second
 * rule: a host whose process never created the tools (a remote renderer, before the snapshot
 * catalog is wired into the views) has no descriptors at all, and would otherwise fold the
 * interactive rows away. It only ever adds visibility, so it cannot mask core's decision.
 */
export function keepsCompactRow(toolName: string): boolean {
  return ALWAYS_VISIBLE_TOOL_NAMES.has(toolName) || coreKeepsCompactRow(toolName);
}

/** Get status color for tool invocation state. */
export function getToolCallColor(state: UiToolState | string): string {
  switch (state) {
    case "input-streaming":
      return COLORS.warning;
    case "input-available":
      return COLORS.primary;
    case "output-available":
      return COLORS.success;
    case "output-error":
    case "output-denied":
      return COLORS.danger;
    case "approval-requested":
      return COLORS.warning;
    case "approval-responded":
      return COLORS.primary;
    default:
      return COLORS.muted;
  }
}

/** A `task` run's live phase, as far as the row cares: only `limit` says the step
 * budget ended it. */
export type TaskRowPhase = "running" | "summary" | "limit" | undefined;

/**
 * A step-budget cutoff, which the row must render as a warning instead of a
 * success.
 *
 * The part still settles as `output-available` (the run neither errored nor was
 * cancelled) and the subagent's own status is `completed`, so neither the tool
 * state nor the status can tell a cut-off run from a clean finish — only the live
 * `taskPhase` can. `taskPhase` is optional, so an absent value degrades to the old
 * behaviour rather than assuming a cutoff.
 */
export function isBudgetCutoffTaskPhase(phase: TaskRowPhase): boolean {
  return phase === "limit";
}

/** Status glyph for a tool row, resolving the user-cancel and budget-cutoff cases before `state`. */
export function getToolStatusGlyph(
  state: UiToolState | string,
  stoppedByLimit = false,
  stoppedByCancel = false
): string {
  // Ordered first, not last: a cut-off `task` is `output-available` and a cancelled
  // `run_command` is `output-error`, so neither reads from the state alone.
  if (stoppedByLimit) return "⚠";
  if (stoppedByCancel) return "⚠";
  switch (state) {
    case "output-available":
      return "✓";
    case "output-error":
    case "output-denied":
      return "✗";
    case "approval-requested":
      return "?";
    default:
      return "";
  }
}

// Re-exported from core so a host cannot drift from the owning process: these are the
// same thresholds and functions the core layer uses when it renders a call.
export {
  DURATION_THRESHOLD_MS,
  LIVE_DURATION_THRESHOLD_MS,
  getCompactOutput,
  getDurationMs,
  getInlineSummary,
} from "@codent/core";

export function buildToolHeader(
  toolName: string,
  displayInput: string | null,
  parenText: string,
  stateColor: string
): string {
  const chalkByColor = chalk as unknown as Record<string, typeof chalk>;
  const colorFn = chalkByColor[stateColor] ?? chalk.white;
  let header = colorFn.bold(toolName);

  if (displayInput) {
    header += " " + colorFn.dim(displayInput);
  }

  if (parenText) {
    header += chalk.hex(COLORS.muted)(parenText);
  }

  return header;
}
