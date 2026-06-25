import chalk from "chalk";

import type { ToolUIPart } from "ai";

/** Get status color for tool invocation state. */
export function getToolCallColor(state: ToolUIPart["state"] | string): string {
  switch (state) {
    case "input-streaming":
      return "yellow";
    case "input-available":
      return "cyan";
    case "output-available":
      return "green";
    case "output-error":
    case "output-denied":
      return "red";
    case "approval-requested":
      return "yellow";
    case "approval-responded":
      return "cyan";
    default:
      return "gray";
  }
}

/** Only show duration for slow operations (>= this threshold). */
export const DURATION_THRESHOLD_MS = 500;

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
export function getInlineSummary(part: ToolUIPart, toolName: string): string | null {
  if (part.state !== "output-available") return null;
  const output = part.output as Record<string, unknown> | undefined;
  if (!output) return null;

  switch (toolName) {
    case "read_file": {
      const totalLines = output.totalLines as number | undefined;
      if (totalLines !== undefined) return `${totalLines} lines`;
      if (output.type === "directory") return `${output.count ?? 0} entries`;
      if (output.type === "image" || output.type === "pdf") return output.type as string;
      return null;
    }
    case "list_file": {
      const count = output.count as number | undefined;
      return count !== undefined ? `${count} entries` : null;
    }
    case "grep": {
      const count = output.count as number | undefined;
      if (count === undefined) return null;
      return count === 0 ? "no matches" : `${count} match${count !== 1 ? "es" : ""}`;
    }
    case "glob": {
      const count = output.count as number | undefined;
      if (count === undefined) return null;
      return count === 0 ? "no files" : `${count} file${count !== 1 ? "s" : ""}`;
    }
    case "write_file":
      return output.created ? "created" : "updated";
    case "edit_file":
    case "search_replace": {
      const replacements = output.replacements as number | undefined;
      if (replacements !== undefined) return `${replacements} replacement${replacements !== 1 ? "s" : ""}`;
      return "applied";
    }
    case "delete_file":
      return "deleted";
    case "move_file":
    case "copy_file":
      return "done";
    case "todo": {
      const stats = output.stats as { total?: number; completed?: number } | undefined;
      if (stats) return `${stats.completed ?? 0}/${stats.total ?? 0} done`;
      return null;
    }
    case "tree": {
      const message = output.message as string | undefined;
      if (message) {
        const match = /(\d+)\s*(?:files?|items?|entries)/i.exec(message);
        if (match) return match[0];
      }
      return null;
    }
    default:
      return null;
  }
}

const SHOW_COMPACT_OUTPUT = new Set(["run_command", "task"]);

/** Get a compact multi-line output summary only for tools where it adds value. */
export function getCompactOutput(part: ToolUIPart, toolName: string): string | null {
  if (!SHOW_COMPACT_OUTPUT.has(toolName)) return null;
  const output = part.output as Record<string, unknown> | undefined;
  if (!output) return null;
  if (typeof output.message === "string") return output.message;
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
