/**
 * Width-aware line wrapping / truncation for user message text.
 *
 * Ink's `<Text wrap="wrap">` does the wrapping at render time with no
 * `maxHeight` / `maxRows` concept, so capping a bubble's height must happen
 * before rendering: wrap the text into physical rows at the terminal width,
 * then drop everything past a row budget.
 *
 * The wrapping here mirrors Ink's own algorithm (word-wrap at spaces, hard-wrap
 * overlong words, CJK / wide characters count as 2 columns) so the predicted
 * row count matches what Ink will actually render.
 */

/** Characters that render as 2 terminal columns (aligned with `string-width`). */
const WIDE_CHAR_RE =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}]/u;

/** Display width of a single character (wide CJK = 2, everything else = 1). */
function displayWidth(char: string): number {
  if (char === "\n" || char === "\r" || char === "\u200b") return 0;
  return WIDE_CHAR_RE.test(char) ? 2 : 1;
}

/** Wrap one logical line (no newlines) into physical rows, mirroring Ink. */
function wrapLogicalLine(line: string, width: number): string[] {
  const rows: string[] = [];
  let currentRow = "";
  let currentRowWidth = 0;
  let isAtStartOfLogicalLine = true;

  let i = 0;
  while (i < line.length) {
    const firstVal = line[i]!;
    let word: string;
    let wordWidth: number;

    if (firstVal === " ") {
      word = " ";
      wordWidth = 1;
    } else {
      let j = i;
      wordWidth = 0;
      while (j < line.length && line[j] !== " " && line[j] !== "\n") {
        wordWidth += displayWidth(line[j]!);
        j++;
      }
      word = line.slice(i, j);
    }

    const j = i + word.length;

    if (currentRowWidth + wordWidth > width && currentRowWidth > 0) {
      if (firstVal === " " && !isAtStartOfLogicalLine) {
        // Drop the space that would overflow.
        i = j;
        continue;
      }
      // Wrap: finish the current row and start a new one.
      rows.push(currentRow);
      currentRow = "";
      currentRowWidth = 0;
      continue;
    }

    if (currentRowWidth === 0 && wordWidth > width) {
      // Hard-wrap an overlong word.
      let k = 0;
      let chunkWidth = 0;
      let chunk = "";
      while (k < word.length) {
        const cw = displayWidth(word[k]!);
        if (chunkWidth + cw > width && chunkWidth > 0) {
          rows.push(chunk);
          chunk = "";
          chunkWidth = 0;
        }
        chunk += word[k]!;
        chunkWidth += cw;
        k++;
      }
      currentRow = chunk;
      currentRowWidth = chunkWidth;
      i = j;
      isAtStartOfLogicalLine = false;
    } else {
      currentRow += word;
      currentRowWidth += wordWidth;
      i = j;
      if (firstVal !== " ") {
        isAtStartOfLogicalLine = false;
      }
    }
  }

  if (currentRowWidth > 0 || rows.length === 0) {
    rows.push(currentRow);
  }
  return rows;
}

/** Wrap text into physical rows at the given terminal width (blank lines preserved). */
export function wrapTextToLines(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const lines: string[] = [];
  for (const logicalLine of text.split("\n")) {
    if (logicalLine === "") {
      lines.push("");
    } else {
      lines.push(...wrapLogicalLine(logicalLine, safeWidth));
    }
  }
  return lines;
}

export interface TruncateToLinesResult {
  /** The (possibly truncated) text; when truncated the last row is a hint line. */
  text: string;
  truncated: boolean;
  /** Number of rows that were dropped (excludes the hint line). */
  hiddenLines: number;
}

/**
 * Cap `text` to at most `maxLines` physical rows at the given width.
 * When overflowing, the last row becomes `… (N lines truncated)` and the
 * returned text renders to exactly `maxLines` rows under Ink's `wrap="wrap"`.
 */
export function truncateTextToMaxLines(text: string, width: number, maxLines: number): TruncateToLinesResult {
  if (maxLines <= 1) {
    return { text, truncated: false, hiddenLines: 0 };
  }
  const lines = wrapTextToLines(text, width);
  if (lines.length <= maxLines) {
    return { text, truncated: false, hiddenLines: 0 };
  }
  const contentLines = lines.slice(0, maxLines - 1);
  const hiddenLines = lines.length - contentLines.length;
  let hint = `\n… (${hiddenLines} lines truncated)`;
  // At very narrow widths the hint could wrap to 2+ rows and blow the budget;
  // fall back to a bare ellipsis so the result still fits `maxLines` rows.
  if (wrapTextToLines(hint, width).length > 1) {
    hint = "\n…";
  }
  return { text: contentLines.join("\n") + hint, truncated: true, hiddenLines };
}
