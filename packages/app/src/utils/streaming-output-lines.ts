/**
 * Helpers for streaming output windows (latest N lines, grow-until-cap).
 */

/** Normalize CRLF / bare CR to LF so Ink does not treat `\r` as cursor reset. */
export function normalizeOutputNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Split text into display lines, dropping a trailing empty segment from a final newline. */
export function splitStreamingLines(text: string): string[] {
  if (!text) return [];
  const lines = normalizeOutputNewlines(text).split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Keep the latest `maxLines` lines. Short buffers are returned as-is (no top padding).
 */
export function takeLatestLines(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0) return [];
  return lines.length > maxLines ? lines.slice(-maxLines) : lines;
}

/** Keep the latest `maxLines` lines and pad on top so the array length is always `maxLines`. */
export function padLatestLines(lines: string[], maxLines: number, filler = ""): string[] {
  if (maxLines <= 0) return [];
  const tail = takeLatestLines(lines, maxLines);
  if (tail.length >= maxLines) return tail;
  return [...Array.from({ length: maxLines - tail.length }, () => filler), ...tail];
}

/**
 * Build a streaming window of the latest lines (grows up to `maxLines`, then scrolls).
 * When `hidden > 0`, marks the first visible line with a leading ellipsis.
 * Empty text with no placeholder yields `{ lines: [], hidden: 0 }`.
 */
export function buildFixedStreamingWindow(
  text: string,
  maxLines: number,
  options?: { emptyPlaceholder?: string; markOverflow?: boolean; padToMax?: boolean }
): { lines: string[]; hidden: number } {
  const { emptyPlaceholder = "", markOverflow = true, padToMax = false } = options ?? {};
  const raw = splitStreamingLines(text);
  const source = raw.length > 0 ? raw : emptyPlaceholder ? [emptyPlaceholder] : [];
  if (source.length === 0) {
    return { lines: [], hidden: 0 };
  }
  const hidden = Math.max(0, source.length - maxLines);
  const lines = padToMax ? padLatestLines(source, maxLines) : takeLatestLines(source, maxLines);
  if (markOverflow && hidden > 0 && lines[0] !== undefined && lines[0] !== "") {
    lines[0] = `… ${lines[0]}`;
  }
  return { lines, hidden };
}
