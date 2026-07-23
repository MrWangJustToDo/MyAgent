import { isSafeCommand } from "./safe-command.js";

import type { PlanModeController } from "./plan-mode-controller.js";
import type { ToolsRecord } from "../tools/tanstack/tools-record.js";

/** Mutating / spawn tools hidden while planning or ready. */
export const PLAN_MODE_EXCLUDED_TOOL_NAMES = new Set([
  "write_file",
  "edit_file",
  "delete_file",
  "copy_file",
  "move_file",
  "task",
  "kill_command",
]);

export function isMcpToolName(name: string): boolean {
  return name.startsWith("mcp__");
}

/** Build exclude set for {@link resolveToolsRecord} during planning/ready. */
export function getPlanModeToolExcludeSet(tools: ToolsRecord): Set<string> {
  const exclude = new Set(PLAN_MODE_EXCLUDED_TOOL_NAMES);
  for (const name of Object.keys(tools)) {
    if (isMcpToolName(name)) exclude.add(name);
  }
  return exclude;
}

export function isPlanModeForbiddenTool(toolName: string): boolean {
  return PLAN_MODE_EXCLUDED_TOOL_NAMES.has(toolName) || isMcpToolName(toolName);
}

/**
 * Defense-in-depth check before tool execution while restricting tools.
 * Returns an error message when the call must be skipped, else null.
 */
export function getPlanModeToolBlockReason(
  planMode: PlanModeController | null | undefined,
  toolName: string,
  args: unknown
): string | null {
  if (!planMode?.isRestrictingTools()) return null;

  if (isPlanModeForbiddenTool(toolName)) {
    return `Plan mode: "${toolName}" is blocked while planning. Use /plan execute after the plan is ready.`;
  }

  if (toolName === "run_command") {
    const command =
      args &&
      typeof args === "object" &&
      "command" in args &&
      typeof (args as { command: unknown }).command === "string"
        ? (args as { command: string }).command
        : "";
    if (!isSafeCommand(command)) {
      return (
        "Plan mode: run_command only allows read-only shell commands (e.g. ls, cat, git status/log/diff). " +
        "Mutating or unsafe commands are blocked until /plan execute."
      );
    }
    if (
      args &&
      typeof args === "object" &&
      "run_in_background" in args &&
      (args as { run_in_background?: boolean }).run_in_background === true
    ) {
      return "Plan mode: background run_command is blocked while planning.";
    }
  }

  return null;
}
