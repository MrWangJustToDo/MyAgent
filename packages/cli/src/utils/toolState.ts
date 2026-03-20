// ============================================================================
// Tool State Utilities
// ============================================================================

import type { ToolUIPart } from "ai";

/**
 * Get status color for tool invocation state
 */
export function getToolCallColor(state: ToolUIPart["state"] | string): string {
  switch (state) {
    case "input-streaming":
      return "yellow";
    case "input-available":
      return "cyan";
    case "output-available":
      return "green";
    case "output-error":
      return "red";
    case "approval-requested":
      return "yellow";
    case "approval-responded":
      return "cyan";
    case "output-denied":
      return "red";
    default:
      return "gray";
  }
}
