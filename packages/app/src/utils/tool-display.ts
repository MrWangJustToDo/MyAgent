import chalk from "chalk";

import { COLORS } from "../theme/colors.js";

import type { UiToolState } from "./tool-part.js";
import type { ToolCallPart } from "@tanstack/ai";

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

/** Only show final duration for slow operations (>= this threshold). */
export const DURATION_THRESHOLD_MS = 500;

/** Show a live elapsed timer on the tool header while executing past this threshold. */
export const LIVE_DURATION_THRESHOLD_MS = 3000;

/** Extract durationMs from tool output if available. */
export function getDurationMs(output: unknown): number | null {
  if (output && typeof output === "object" && "durationMs" in output) {
    const durationMs = (output as { durationMs?: unknown }).durationMs;
    if (typeof durationMs === "number") {
      return durationMs;
    }
  }
  return null;
}

/**
 * Get a brief inline summary for the header line, such as "3 matches" or "12 files".
 * Returns null if the tool has no meaningful inline summary.
 */
export function getInlineSummary(part: ToolCallPart, toolName: string): string | null {
  if (part.state !== "complete") return null;
  const output = part.output as Record<string, unknown> | undefined;
  if (!output) return null;

  switch (toolName) {
    case "read_file": {
      const totalLines = output.totalLines as number | undefined;
      if (totalLines !== undefined) return `${totalLines} lines`;
      if (output.type === "directory") {
        const totalEntries = output.totalEntries as number | undefined;
        return totalEntries !== undefined ? `${totalEntries} entries` : null;
      }
      if (output.type === "image" || output.type === "pdf") return output.type as string;
      return null;
    }
    case "list_file": {
      const count = output.count as number | undefined;
      return count !== undefined ? `${count} entries` : null;
    }
    case "grep": {
      const matches = output.matches as unknown[] | undefined;
      if (!matches) return null;
      return matches.length === 0 ? "no matches" : `${matches.length} match${matches.length !== 1 ? "es" : ""}`;
    }
    case "glob": {
      const files = output.files as string[] | undefined;
      if (!files) return null;
      return files.length === 0 ? "no files" : `${files.length} file${files.length !== 1 ? "s" : ""}`;
    }
    case "write_file":
      return output.created ? "created" : "updated";
    case "edit_file": {
      const replacements = output.replacements as number | undefined;
      if (replacements !== undefined) return `${replacements} replacement${replacements !== 1 ? "s" : ""}`;
      return "applied";
    }
    case "delete_file":
      return "deleted";
    case "todo": {
      const stats = output.stats as { total?: number; completed?: number } | undefined;
      if (stats) return `${stats.completed ?? 0}/${stats.total ?? 0} done`;
      return null;
    }
    case "create_plan":
    case "update_plan": {
      const stepCount = output.stepCount as number | undefined;
      if (typeof stepCount === "number") return `${stepCount} steps`;
      return output.ok === false ? "failed" : "ready";
    }
    case "websearch": {
      const results = output.results as unknown[] | undefined;
      if (!results) return null;
      return results.length === 0 ? "no results" : `${results.length} result${results.length !== 1 ? "s" : ""}`;
    }
    case "webfetch": {
      const truncated = output.truncated === true;
      const contentType = typeof output.contentType === "string" ? output.contentType : null;
      if (contentType) return truncated ? `${contentType} (truncated)` : contentType;
      return truncated ? "truncated" : "fetched";
    }
    case "tree": {
      const totalEntries = output.totalEntries as number | undefined;
      if (totalEntries !== undefined) return `${totalEntries} entries`;
      return null;
    }
    default:
      return null;
  }
}

const SHOW_COMPACT_OUTPUT = new Set(["run_command"]);

/** Get a compact multi-line output summary only for tools where it adds value. */
export function getCompactOutput(part: ToolCallPart, toolName: string): string | null {
  if (!SHOW_COMPACT_OUTPUT.has(toolName)) return null;
  const output = part.output as Record<string, unknown> | undefined;
  if (!output) return null;
  // run_command: derive a compact summary from exit code / success.
  // Previously this read output.message; now we generate it from structured fields.
  if (toolName === "run_command") {
    if (output.runInBackground && output.jobId) {
      return `Background job ${String(output.jobId)} started`;
    }
    const success = output.success as boolean | undefined;
    const exitCode = output.exitCode as number | undefined;
    const durationMs = output.durationMs as number | undefined;
    const dur = typeof durationMs === "number" ? ` in ${durationMs}ms` : "";
    return success ? `Command executed successfully${dur}` : `Command failed with exit code ${exitCode ?? "?"}${dur}`;
  }
  return null;
}

/**
 * Build the full tool header as a single chalk-styled string.
 * Produces: `toolName args (summary, duration)`.
 */
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
    header += chalk.gray.dim(parenText);
  }

  return header;
}
