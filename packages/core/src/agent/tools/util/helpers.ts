import { getEnv } from "../../../env.js";

/**
 * Get file content and a modification identifier.
 * Uses a content hash as the modification identifier when mtime is unavailable.
 */
export async function getFile(path: string): Promise<{
  content: string;
  modifiedTime: string;
}> {
  const content = await getEnv().fs.readFile(path);
  const modifiedTime = hashContent(content);
  return { content, modifiedTime };
}

/**
 * Get just the modification identifier for a file.
 *
 * When the caller already has the content in memory (e.g. edit-file tool
 * after applying edits), pass it via `knownContent` to avoid a redundant
 * re-read of the file from disk.
 */
export async function getFileModifiedTime(path: string, knownContent?: string): Promise<string> {
  const content = knownContent ?? (await getEnv().fs.readFile(path));
  return hashContent(content);
}

/**
 * Simple hash function for content-based modification detection.
 * Uses a fast non-cryptographic hash.
 *
 * Exported so callers that already hold the content in memory can compute the
 * modification identifier without re-reading the file.
 */
export function hashContent(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
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
