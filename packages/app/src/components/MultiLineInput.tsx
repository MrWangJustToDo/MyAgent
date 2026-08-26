import chalk from "chalk";
import { Text } from "ink";

import {
  IMAGE_PLACEHOLDER_START,
  IMAGE_PLACEHOLDER_END,
  PASTE_PLACEHOLDER_START,
  PASTE_PLACEHOLDER_END,
  formatPastePlaceholder,
} from "../hooks/use-user-input.js";
import { COLORS } from "../theme/colors.js";

import type { PendingPaste } from "../hooks/use-user-input.js";

export interface MultiLineInputProps {
  value: string;
  cursorPosition: number;
  showCursor?: boolean;
  placeholder?: string;
  selectAll?: boolean;
  /** Collapsed large pastes (indexed by placeholder character) */
  pendingPastes?: readonly (PendingPaste | undefined)[];
  /** Paste placeholder currently expanded inline (null = all collapsed) */
  expandedPasteIndex?: number | null;
}

function isImagePlaceholderCode(code: number): boolean {
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
}

function isPastePlaceholderCode(code: number): boolean {
  return code >= PASTE_PLACEHOLDER_START && code <= PASTE_PLACEHOLDER_END;
}

function buildImageDisplayNumbers(value: string): Map<number, number> {
  const displayNumbers = new Map<number, number>();
  let displayNum = 1;

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (isImagePlaceholderCode(code)) {
      displayNumbers.set(code - IMAGE_PLACEHOLDER_START, displayNum++);
    }
  }

  return displayNumbers;
}

/** pasteIndex -> lineCount (0 when the entry is missing, e.g. an orphan). */
function buildPasteDisplayNumbers(
  value: string,
  pendingPastes: readonly (PendingPaste | undefined)[] | undefined
): Map<number, number> {
  const displayNumbers = new Map<number, number>();
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (isPastePlaceholderCode(code)) {
      const index = code - PASTE_PLACEHOLDER_START;
      displayNumbers.set(index, pendingPastes?.[index]?.lineCount ?? 0);
    }
  }
  return displayNumbers;
}

/**
 * Build the display value: expanded paste placeholders become inline multi-line
 * text (so their full content is reviewable), while folded placeholders stay as
 * single characters so {@link getCharDisplay} renders them as a label.
 */
function buildPasteDisplayValue(
  value: string,
  pendingPastes: readonly (PendingPaste | undefined)[] | undefined,
  expandedPasteIndex: number | null | undefined
): string {
  if (!pendingPastes || pendingPastes.length === 0) return value;
  let display = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (isPastePlaceholderCode(code)) {
      const index = code - PASTE_PLACEHOLDER_START;
      const paste = pendingPastes[index];
      if (paste && expandedPasteIndex === index) {
        display += `\n${paste.text}\n`;
      } else {
        display += char;
      }
    } else {
      display += char;
    }
  }
  return display;
}

function getCharDisplay(
  char: string,
  imageDisplayNumbers: Map<number, number>,
  pasteDisplayNumbers: Map<number, number>
): { text: string; isImage: boolean; isPaste: boolean } {
  const code = char.charCodeAt(0);
  if (isImagePlaceholderCode(code)) {
    const displayNum = imageDisplayNumbers.get(code - IMAGE_PLACEHOLDER_START) ?? "?";
    return { text: `[Image #${displayNum}]`, isImage: true, isPaste: false };
  }
  if (isPastePlaceholderCode(code)) {
    const lineCount = pasteDisplayNumbers.get(code - PASTE_PLACEHOLDER_START) ?? 0;
    return { text: formatPastePlaceholder(lineCount), isImage: false, isPaste: true };
  }
  return { text: char, isImage: false, isPaste: false };
}

/**
 * Build styled string for a single line segment.
 */
function buildStyledString(
  segment: string,
  segmentOffset: number,
  imageDisplayNumbers: Map<number, number>,
  pasteDisplayNumbers: Map<number, number>,
  selectAll: boolean,
  showCursor: boolean,
  cursorPosition: number
): string {
  let rendered = "";
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    const { text: display, isImage, isPaste } = getCharDisplay(char, imageDisplayNumbers, pasteDisplayNumbers);
    const globalIndex = segmentOffset + i;

    if (selectAll) {
      rendered += chalk.bgCyan.black(display);
    } else if (showCursor && globalIndex === cursorPosition) {
      rendered += chalk.inverse(display[0] || " ") + display.slice(1);
    } else if (isImage) {
      // Subtle highlight for image placeholders
      rendered += chalk.dim.cyan(display);
    } else if (isPaste) {
      // Distinct highlight for collapsed paste placeholders
      rendered += chalk.dim.yellow(display);
    } else {
      rendered += display;
    }
  }

  return rendered;
}

/**
 * Simple input component — renders text with a chalk.inverse cursor.
 * Handles newline characters by splitting into separate Text elements.
 */
export const MultiLineInput = ({
  value,
  cursorPosition,
  showCursor = true,
  placeholder = "",
  selectAll = false,
  pendingPastes,
  expandedPasteIndex = null,
}: MultiLineInputProps) => {
  if (!value && showCursor) {
    if (placeholder) {
      const rendered = chalk.inverse(placeholder[0] || " ") + chalk.gray(placeholder.slice(1));
      return <Text wrap="wrap">{rendered}</Text>;
    }
    return <Text>{chalk.inverse(" ")}</Text>;
  }

  if (!value) {
    return placeholder ? <Text color={COLORS.muted}>{placeholder}</Text> : null;
  }

  const displayValue = buildPasteDisplayValue(value, pendingPastes, expandedPasteIndex);
  const imageDisplayNumbers = buildImageDisplayNumbers(displayValue);
  const pasteDisplayNumbers = buildPasteDisplayNumbers(displayValue, pendingPastes);
  const lines = displayValue.split(/\r?\n/);

  // Build array of line start offsets in the display value
  const lineOffsets: number[] = [];
  let searchStart = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(searchStart);
    searchStart += lines[i]!.length;
    // Skip \r\n or \n
    if (searchStart < displayValue.length && displayValue[searchStart] === "\r") {
      searchStart += 2;
    } else if (searchStart < displayValue.length && displayValue[searchStart] === "\n") {
      searchStart += 1;
    }
  }

  return (
    <>
      {lines.map((line, lineIndex) => {
        const lineOffset = lineOffsets[lineIndex]!;
        const styledContent = buildStyledString(
          line,
          lineOffset,
          imageDisplayNumbers,
          pasteDisplayNumbers,
          selectAll,
          showCursor,
          cursorPosition
        );

        // Show cursor at end of line if cursor is positioned exactly at line end
        const lineEndPos = lineOffset + line.length;
        const showCursorAtLineEnd = showCursor && !selectAll && cursorPosition === lineEndPos;

        if (showCursorAtLineEnd) {
          return (
            <Text key={lineIndex} wrap="wrap">
              {styledContent}
              {chalk.inverse(" ")}
            </Text>
          );
        }

        // Empty lines (e.g. blank lines between consecutive newlines) would
        // collapse to zero height in ink's yoga layout and disappear. Render a
        // single space so the line still occupies a row. Use a regular space
        // (not \u00A0) so word-wrap measurement stays consistent with non-empty
        // lines.
        const content = styledContent || " ";

        return (
          <Text key={lineIndex} wrap="wrap">
            {content}
          </Text>
        );
      })}
    </>
  );
};
