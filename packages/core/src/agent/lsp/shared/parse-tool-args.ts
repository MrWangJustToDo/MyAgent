/**
 * Parse tool-call args from extension `tool:after:*` interceptors.
 *
 * TanStack passes `toolCall.function.arguments` as a JSON string; interceptors
 * must parse before reading fields such as `path`.
 */

/** Parse tool args from a JSON string or object payload. */
export function parseToolCallArgs(args: unknown): Record<string, unknown> | null {
  if (typeof args === "string") {
    try {
      const parsed: unknown = JSON.parse(args);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return null;
}

/** Extract a non-empty `path` field from raw tool args. */
export function extractToolPath(args: unknown): string | undefined {
  const parsed = parseToolCallArgs(args);
  if (!parsed) return undefined;
  const path = parsed.path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}
