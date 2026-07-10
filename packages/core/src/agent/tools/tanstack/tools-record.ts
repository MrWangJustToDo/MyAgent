import type { ClientTool, ServerTool } from "@tanstack/ai";

// ============================================================================
// Tools record
// ============================================================================

/** Named TanStack tools assembled for a managed agent. */
export type ToolsRecord = Record<string, ServerTool | ClientTool>;

export interface ToolsToArrayOptions {
  exclude?: ReadonlySet<string>;
}

/** Flatten a tools record to the array expected by `chat({ tools })`. */
export function toolsToArray(tools: ToolsRecord, options: ToolsToArrayOptions = {}): Array<ServerTool | ClientTool> {
  const exclude = options.exclude ?? new Set<string>();
  const result: Array<ServerTool | ClientTool> = [];

  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || exclude.has(name)) continue;
    result.push(tool);
  }

  return result;
}
