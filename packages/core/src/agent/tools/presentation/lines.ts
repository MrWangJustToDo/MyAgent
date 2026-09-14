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
