/**
 * Read-only tool set for exploration subagents.
 */

import { createGlobTool } from "../tools/glob-tool.js";
import { createGrepTool } from "../tools/grep-tool.js";
import { createListFileTool } from "../tools/list-file-tool.js";
import { createReadFileTool } from "../tools/read-file-tool.js";
import { type ToolsRecord } from "../tools/tanstack/tools-record.js";
import { createTreeTool } from "../tools/tree-tool.js";
import { createWebfetchTool } from "../tools/webfetch-tool.js";
import { createWebsearchTool } from "../tools/websearch-tool.js";

import { createBeginSummaryTool } from "./begin-summary-tool.js";

import type { ManagedAgent } from "../../managers/managed-agent.js";

/**
 * Creates the restricted read-only tool set for exploration subagents.
 * These tools allow exploration but not modification.
 */
export const createSubagentTools = (managed: ManagedAgent): ToolsRecord => {
  return {
    read_file: createReadFileTool({ usage: managed.usage }),
    glob: createGlobTool(),
    grep: createGrepTool(),
    list_file: createListFileTool(),
    tree: createTreeTool(),
    webfetch: createWebfetchTool({ managed }),
    websearch: createWebsearchTool({ managed }),
    begin_summary: createBeginSummaryTool(),
  };
};

/** @deprecated Use {@link createSubagentTools} instead. */
export const createExploreTools = createSubagentTools;
