import { createContext, useContext } from "react";

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Tool call ids whose complex output blocks (todo list, command output) are
 * collapsed to their one-line header summary. Only the most recent block stays
 * expanded — see `computeCollapsedToolOutputs`.
 */
export const CollapsedToolsContext = createContext<ReadonlySet<string>>(EMPTY_SET);

export function useToolOutputCollapsed(toolCallId: string): boolean {
  return useContext(CollapsedToolsContext).has(toolCallId);
}
