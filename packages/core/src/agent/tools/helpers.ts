import type { Sandbox } from "../../environment";

/**
 * Get file content and a modification identifier.
 * For just-bash, we use the content hash as the modification identifier
 * since just-bash doesn't track file modification times.
 */
export async function getFile(
  sandbox: Sandbox,
  path: string
): Promise<{
  content: string;
  modifiedTime: string;
}> {
  const content = await sandbox.filesystem.readFile(path);
  // Use a simple hash of content as the "modification time" identifier
  // This ensures we can detect if the file changed between operations
  const modifiedTime = hashContent(content);
  return { content, modifiedTime };
}

/**
 * Get just the modification identifier for a file.
 */
export async function getFileModifiedTime(sandbox: Sandbox, path: string): Promise<string> {
  const content = await sandbox.filesystem.readFile(path);
  return hashContent(content);
}

/**
 * Simple hash function for content-based modification detection.
 * Uses a fast non-cryptographic hash.
 */
function hashContent(content: string): string {
  // Simple djb2 hash for quick content fingerprinting
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16);
}

/**
 * Wraps an async function and measures its execution duration.
 * Returns the result along with durationMs.
 */
export async function withDuration<T>(fn: () => Promise<T>): Promise<T & { durationMs: number }> {
  const startTime = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - startTime);
  return { ...result, durationMs };
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
    // Keep the end (useful for error messages, logs)
    return {
      text: `[...truncated ${str.length - maxLength} chars from start...]\n${str.slice(-maxLength)}`,
      truncated: true,
    };
  } else {
    // Keep the start (default)
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
