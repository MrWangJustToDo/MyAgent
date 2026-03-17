// ============================================================================
// Tool State Utilities
// ============================================================================

/**
 * Tool invocation state from AI SDK
 */
export type ToolInvocationState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

/**
 * Get status color for tool invocation state
 */
export function getToolCallColor(state: ToolInvocationState | string): string {
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
