/** Default limits for tool output truncation. */
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

/** Truncate a string from the end (or the start) with an indicator of what was dropped. */
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
