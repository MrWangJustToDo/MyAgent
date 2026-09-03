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
      const source = output.source as string | undefined;
      const planTag = source === "plan" ? " plan" : "";
      if (stats) return `${stats.completed ?? 0}/${stats.total ?? 0} done${planTag}`;
      return source === "plan" ? "plan" : null;
    }
    case "create_plan":
    case "update_plan": {
      const stepCount = output.stepCount as number | undefined;
      if (typeof stepCount === "number") return `${stepCount} steps`;
      return output.ok === false ? "failed" : "ready";
    }
    case "complete_plan":
      return output.ok === false ? "failed" : "done";
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

    // --- LSP inspection ---
    case "lsp_diagnostics": {
      const errors = output.errors as number | undefined;
      const warnings = output.warnings as number | undefined;
      const count = output.count as number | undefined;
      if ((errors ?? 0) > 0) {
        return `${errors} err${errors !== 1 ? "s" : ""}${(warnings ?? 0) > 0 ? `, ${warnings} warn` : ""}`;
      }
      if ((warnings ?? 0) > 0) return `${warnings} warning${warnings !== 1 ? "s" : ""}`;
      if (count !== undefined && count > 0) return `${count} issue${count !== 1 ? "s" : ""}`;
      return count === 0 ? "clean" : null;
    }
    case "lsp_definition": {
      const count = output.count as number | undefined;
      if (count !== undefined) return count > 0 ? `${count} definition${count !== 1 ? "s" : ""}` : "not found";
      return null;
    }
    case "lsp_references": {
      const count = output.count as number | undefined;
      if (count !== undefined) return count > 0 ? `${count} reference${count !== 1 ? "s" : ""}` : "none";
      return null;
    }
    case "lsp_symbols": {
      const count = output.count as number | undefined;
      if (count !== undefined) return count > 0 ? `${count} symbols` : "none";
      return null;
    }
    case "lsp_completions": {
      const count = output.count as number | undefined;
      const total = output.total as number | undefined;
      if (total !== undefined) return `${count ?? 0}/${total} completions`;
      if (count !== undefined) return count > 0 ? `${count} completions` : "none";
      return null;
    }
    case "lsp_code_actions": {
      const count = output.count as number | undefined;
      const preferredCount = output.preferredCount as number | undefined;
      if (count !== undefined) {
        if (count === 0) return "none";
        return (preferredCount ?? 0) > 0 ? `${count} (${preferredCount} preferred)` : `${count} actions`;
      }
      return null;
    }
    case "lsp_hover":
      return output.hasResult === true ? "hover" : output.hasResult === false ? "no info" : null;

    // --- AST / structural analysis ---
    case "ast_search": {
      const matchCount = output.matchCount as number | undefined;
      if (matchCount !== undefined)
        return matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? "es" : ""}` : "no matches";
      return null;
    }
    case "code_overview": {
      const files = output.files as number | undefined;
      const symbols = output.symbols as number | undefined;
      if (files !== undefined) {
        const head = `${files} file${files !== 1 ? "s" : ""}`;
        return symbols !== undefined ? `${head}, ${symbols} symbols` : head;
      }
      return null;
    }
    case "code_rewrite": {
      const dryRun = output.dryRun as boolean | undefined;
      const filesModified = output.filesModified as number | undefined;
      if (dryRun === false) {
        return filesModified !== undefined && filesModified > 0
          ? `modified ${filesModified} file${filesModified !== 1 ? "s" : ""}`
          : "no changes";
      }
      const matchCount = output.matchCount as number | undefined;
      if (matchCount !== undefined) {
        return matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? "es" : ""} (preview)` : "no matches";
      }
      return null;
    }
    case "lsp_rename": {
      const editCount = output.editCount as number | undefined;
      const fileCount = output.fileCount as number | undefined;
      if (editCount !== undefined && editCount > 0) {
        return `${editCount} edit${editCount !== 1 ? "s" : ""}${fileCount !== undefined ? `, ${fileCount} file${fileCount !== 1 ? "s" : ""}` : ""} (preview)`;
      }
      return editCount === 0 ? "no edits" : null;
    }

    // --- Memory ---
    case "memory_list": {
      const count = output.count as number | undefined;
      if (count !== undefined) return `${count} memory${count !== 1 ? "ies" : "y"}`;
      return null;
    }
    case "memory_read": {
      const type = output.type as string | undefined;
      return typeof type === "string" ? `[${type}]` : null;
    }
    case "memory_write":
      return output.ok === false ? "failed" : "saved";

    // --- Skills ---
    case "list_skills": {
      const count = output.count as number | undefined;
      if (count !== undefined) return `${count} skill${count !== 1 ? "s" : ""}`;
      return null;
    }
    case "load_skill":
      return typeof output.name === "string" ? "loaded" : null;

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
    // Success is already visible from the header icon (and the duration once
    // it exceeds the threshold) — only failures need an explicit line.
    if (success !== false) return null;
    const exitCode = output.exitCode as number | undefined;
    const durationMs = output.durationMs as number | undefined;
    const dur = typeof durationMs === "number" ? ` in ${durationMs}ms` : "";
    return `Command failed with exit code ${exitCode ?? "?"}${dur}`;
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
    header += chalk.hex(COLORS.muted)(parenText);
  }

  return header;
}
