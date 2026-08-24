import { createSubagentTools } from "../../subagent/subagent-tools.js";
import { createTools } from "../create-tools.js";

import { toolsToArray, type ToolsRecord } from "./tools-record.js";

import type { ManagedAgent, UsageTracker } from "../../../runtime-types/hosts.js";
import type { AnyClientTool, AnyServerTool } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** Tools executed on the client (no server execute). */
export const CLIENT_TOOL_NAMES = new Set(["ask_user"]);

/** Tools excluded from exploration subagents (read-only subset). */
export const SUBAGENT_EXCLUDED_TOOL_NAMES = new Set([
  "run_command",
  "write_file",
  "edit_file",
  "delete_file",
  "task",
  "todo",
  "ask_user",
  "create_plan",
  "update_plan",
  "complete_plan",
  "list_skills",
  "load_skill",
]);

/** Default exploration subagent tools (read-only fs + web research + begin_summary). */
const SUBAGENT_TOOL_NAMES = ["read_file", "glob", "grep", "list_file", "tree", "webfetch", "websearch"] as const;

// ============================================================================
// TanStack tool arrays
// ============================================================================

/**
 * Flatten a tools record to TanStack tools for {@link AgentRunner}.
 */
export function resolveToolsRecord(
  record: ToolsRecord,
  options: { exclude?: ReadonlySet<string> } = {}
): Array<AnyServerTool | AnyClientTool> {
  return toolsToArray(record, options);
}

/**
 * Read-only exploration subagent tools as {@link AnyServerTool}[].
 */
export function createTanStackSubagentTools(managed?: ManagedAgent): AnyServerTool[] {
  const toolRecord = createSubagentTools(managed);
  return toolsToArray(toolRecord, { exclude: SUBAGENT_EXCLUDED_TOOL_NAMES }) as AnyServerTool[];
}

/**
 * Default root-agent filesystem/shell tools (before task/skills/MCP extensions).
 */
export async function createTanStackTools(options: { usage?: UsageTracker } = {}): Promise<AnyServerTool[]> {
  const toolRecord = await createTools({ usage: options.usage });
  return toolsToArray(toolRecord) as AnyServerTool[];
}

/** Names of tools included in the default exploration subagent set (excluding begin_summary). */
export function getReadOnlyTanStackToolNames(): readonly string[] {
  return SUBAGENT_TOOL_NAMES;
}
