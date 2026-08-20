/** Per-URI lock while a synthetic-dot completion temporarily mutates document text. */
export const syntheticDotLocks = new Set<string>();

/**
 * True when the cursor is at the end of an identifier (member completion via temporary `.`).
 * Returns where to insert the dot, or null.
 */
export function shouldSyntheticTrigger(
  content: string,
  line: number,
  character: number
): { insertLine: number; insertChar: number } | null {
  const lines = content.split("\n");
  if (line < 0 || line >= lines.length) return null;
  const lineText = lines[line]!;
  if (character < 0 || character > lineText.length) return null;
  if (lineText[character] === ".") return null;

  const charBefore = character > 0 ? lineText[character - 1] : "";
  if (!charBefore) return null;
  if (/[\w\d_\)\]]/.test(charBefore)) {
    return { insertLine: line, insertChar: character };
  }
  return null;
}

export function insertDot(content: string, line: number, character: number): string {
  const lines = content.split("\n");
  const lineText = lines[line]!;
  lines[line] = lineText.slice(0, character) + "." + lineText.slice(character);
  return lines.join("\n");
}
