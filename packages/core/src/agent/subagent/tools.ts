/**
 * Read-only tool set for exploration subagents.
 */

import { createGlobTool } from "../tools/glob-tool.js";
import { createGrepTool } from "../tools/grep-tool.js";
import { createListFileTool } from "../tools/list-file-tool.js";
import { createReadFileTool } from "../tools/read-file-tool.js";
import { createTreeTool } from "../tools/tree-tool.js";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context/agent-context.js";
import type { ToolSet } from "ai";

/**
 * Creates the restricted read-only tool set for exploration subagents.
 * These tools allow exploration but not modification.
 */
export const createSubagentTools = (sandbox: Sandbox, context?: AgentContext): ToolSet => {
  return {
    read_file: createReadFileTool({ sandbox, context }),
    glob: createGlobTool({ sandbox }),
    grep: createGrepTool({ sandbox }),
    list_file: createListFileTool({ sandbox }),
    tree: createTreeTool({ sandbox }),
  };
};

/** Alias for backward compatibility */
export const createExploreTools = createSubagentTools;
