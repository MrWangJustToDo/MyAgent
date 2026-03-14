// ============================================================================
// Tool State Utilities
// ============================================================================

/**
 * Tool call state from TanStack AI
 */
export type ToolCallState =
  | "awaiting-input"
  | "input-streaming"
  | "input-complete"
  | "approval-requested"
  | "approval-responded";

/**
 * Get status color for tool call state
 */
export function getToolCallColor(state: ToolCallState): string {
  switch (state) {
    case "awaiting-input":
    case "input-streaming":
      return "yellow";
    case "input-complete":
      return "cyan";
    case "approval-requested":
      return "yellow";
    case "approval-responded":
      return "green";
    default:
      return "gray";
  }
}
