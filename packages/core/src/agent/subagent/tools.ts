/**
 * Read-only tool set for exploration subagents.
 */

import { createGlobTool } from "../tools/glob-tool.js";
import { createGrepTool } from "../tools/grep-tool.js";
import { createListFileTool } from "../tools/list-file-tool.js";
import { createReadFileTool } from "../tools/read-file-tool.js";
import { type ToolsRecord } from "../tools/tanstack/tools-record.js";
import { createTreeTool } from "../tools/tree-tool.js";

import { createBeginSummaryTool } from "./begin-summary-tool.js";

import type { UsageTracker } from "../../managers/usage-tracker.js";

/**
 * Creates the restricted read-only tool set for exploration subagents.
 * These tools allow exploration but not modification.
 */
export const createSubagentTools = (usage?: UsageTracker): ToolsRecord => {
  return {
    read_file: createReadFileTool({ usage }),
    glob: createGlobTool(),
    grep: createGrepTool(),
    list_file: createListFileTool(),
    tree: createTreeTool(),
    begin_summary: createBeginSummaryTool(),
  };
};

/** Alias for backward compatibility */
export const createExploreTools = createSubagentTools;
