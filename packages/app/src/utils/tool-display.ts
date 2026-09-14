import { getToolPresentation } from "@my-agent/core";
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
 * Whether a tool owns its compact presentation: structured UI
 * ({@link ALWAYS_VISIBLE_TOOL_NAMES}) or a registered `present.text` renderer. That
 * string is a single curated line by contract — exactly compact density — so such a
 * tool keeps its row (instead of folding into an activity count) and renders that one
 * line as its output block.
 */
export function keepsCompactRow(toolName: string): boolean {
  return ALWAYS_VISIBLE_TOOL_NAMES.has(toolName) || getToolPresentation(toolName)?.text !== undefined;
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

// Re-exported from core so a host cannot drift from the owning process: these are the
// same thresholds and functions the core layer uses when it renders a call.
export {
  DURATION_THRESHOLD_MS,
  LIVE_DURATION_THRESHOLD_MS,
  getCompactOutput,
  getDurationMs,
  getInlineSummary,
} from "@my-agent/core";

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
