import { createSubagentTools } from "../../subagent/tools.js";
import { createTools } from "../create-tools.js";

import { toolsToArray, type ToolsRecord } from "./tools-record.js";

import type { ManagedAgent } from "../../../managers/managed-agent.js";
import type { UsageTracker } from "../../../managers/usage-tracker.js";
import type { AgentContext } from "../../agent-context/agent-context.js";
import type { ClientTool, ServerTool } from "@tanstack/ai";

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
): Array<ServerTool | ClientTool> {
  return toolsToArray(record, options);
}

/**
 * Read-only exploration subagent tools as {@link ServerTool}[].
 */
export function createTanStackSubagentTools(managed?: ManagedAgent): ServerTool[] {
  const toolRecord = createSubagentTools(managed ?? ({} as ManagedAgent));
  return toolsToArray(toolRecord, { exclude: SUBAGENT_EXCLUDED_TOOL_NAMES }) as ServerTool[];
}

/**
 * Default root-agent filesystem/shell tools (before task/skills/MCP extensions).
 */
export async function createTanStackTools(
  options: { context?: AgentContext; usage?: UsageTracker } = {}
): Promise<ServerTool[]> {
  const toolRecord = await createTools({ context: options.context, usage: options.usage });
  return toolsToArray(toolRecord) as ServerTool[];
}

/** Names of tools included in the default exploration subagent set (excluding begin_summary). */
export function getReadOnlyTanStackToolNames(): readonly string[] {
  return SUBAGENT_TOOL_NAMES;
}
