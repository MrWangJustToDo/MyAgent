import type { ToolCallStatus } from "@my-agent/core";

// ============================================================================
// Tool Formatting
// ============================================================================

/** Format tool input for display */
export function formatToolInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input === "string") return input.length > 50 ? input.slice(0, 50) + "..." : input;

  const obj = input as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "";

  const formatted = entries
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 30 ? strValue.slice(0, 30) + "..." : strValue;
      return `${key}=${truncated}`;
    })
    .join(", ");

  return entries.length > 2 ? `(${formatted}, ...)` : `(${formatted})`;
}

/** Format tool output for display */
export function formatToolOutput(output: unknown): string {
  if (output === undefined || output === null) return "";
  const str = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

// ============================================================================
// Status Helpers
// ============================================================================

/** Get status color for tool */
export function getStatusColor(status: ToolCallStatus): string {
  switch (status) {
    case "streaming":
    case "pending":
    case "running":
    case "approved":
      return "yellow";
    case "success":
      return "green";
    case "error":
      return "red";
    case "rejected":
    case "need-approve":
      return "yellow";
    default:
      return "gray";
  }
}

/** Format tool arguments for detailed display (multi-line) */
export function formatToolArgs(args: unknown): string {
  if (args === undefined || args === null) return "No arguments";
  if (typeof args === "string") return args.length > 50 ? args.slice(0, 50) + "..." : args;

  const obj = args as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "No arguments";

  return entries
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 50 ? strValue.slice(0, 50) + "..." : strValue;
      return `  ${key}: ${truncated}`;
    })
    .join("\n");
}
