import { getEnv } from "../../../env.js";

/**
 * Get file content.
 */
export async function getFile(path: string): Promise<string> {
  return getEnv().fs.readFile(path);
}

/**
 * Wraps an async function and measures its execution duration.
 * Returns the result along with durationMs.
 *
 * Also injects the `cachedOutputPath` base field with a null default when the
 * tool's execute result doesn't provide it. Tools that produce large output
 * override `cachedOutputPath` via `maybeCacheOutput`.
 *
 * Errors are NOT caught here — tools throw on failure and the AI SDK surfaces
 * the error via the `output-error` tool state.
 */
export async function withDuration<T extends Record<string, unknown>>(
  fn: () => Promise<T>
): Promise<T & { durationMs: number; cachedOutputPath: string | null }> {
  const startTime = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - startTime);
  return {
    ...result,
    durationMs,
    cachedOutputPath: (result.cachedOutputPath as string | null | undefined) ?? null,
  };
}

// ============================================================================
// Output Truncation Helpers
// ============================================================================

/** Default limits for tool output truncation */
export const OUTPUT_LIMITS = {
  /** Maximum characters for text content (roughly 12.5k tokens) */
  MAX_CONTENT_CHARS: 50000,
  /** Maximum items in arrays (files, entries, matches, etc.) */
  MAX_ARRAY_ITEMS: 500,
  /** Maximum characters per line */
  MAX_LINE_CHARS: 2000,
  /** Maximum bytes for binary content */
  MAX_BINARY_BYTES: 10 * 1024 * 1024,
} as const;

/**
 * Truncates a string from the end with an indicator
 */
export function truncateString(str: string, maxLength: number, fromEnd = false): { text: string; truncated: boolean } {
  if (str.length <= maxLength) {
    return { text: str, truncated: false };
  }

  if (fromEnd) {
    return {
      text: `[...truncated ${str.length - maxLength} chars from start...]\n${str.slice(-maxLength)}`,
      truncated: true,
    };
  } else {
    return {
      text: `${str.slice(0, maxLength)}\n[...truncated ${str.length - maxLength} chars...]`,
      truncated: true,
    };
  }
}

/**
 * Truncates an array with an indicator of how many items were omitted
 */
export function truncateArray<T>(arr: T[], maxItems: number): { items: T[]; truncated: boolean; total: number } {
  if (arr.length <= maxItems) {
    return { items: arr, truncated: false, total: arr.length };
  }

  return {
    items: arr.slice(0, maxItems),
    truncated: true,
    total: arr.length,
  };
}
