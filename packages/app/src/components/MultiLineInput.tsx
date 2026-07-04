import chalk from "chalk";
import { Text } from "ink";

import { IMAGE_PLACEHOLDER_START, IMAGE_PLACEHOLDER_END } from "../hooks/use-user-input.js";
import { COLORS } from "../theme/colors.js";

export interface MultiLineInputProps {
  value: string;
  cursorPosition: number;
  showCursor?: boolean;
  placeholder?: string;
  selectAll?: boolean;
}

function isImagePlaceholderCode(code: number): boolean {
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
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

function getCharDisplay(char: string, imageDisplayNumbers: Map<number, number>): { text: string; isImage: boolean } {
  const code = char.charCodeAt(0);
  if (isImagePlaceholderCode(code)) {
    const displayNum = imageDisplayNumbers.get(code - IMAGE_PLACEHOLDER_START) ?? "?";
    return { text: `[Image #${displayNum}]`, isImage: true };
  }
  return { text: char, isImage: false };
}

/**
 * Build styled string for a single line segment.
 */
function buildStyledString(
  segment: string,
  segmentOffset: number,
  imageDisplayNumbers: Map<number, number>,
  selectAll: boolean,
  showCursor: boolean,
  cursorPosition: number
): string {
  let rendered = "";
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    const { text: display, isImage } = getCharDisplay(char, imageDisplayNumbers);
    const globalIndex = segmentOffset + i;

    if (selectAll) {
      rendered += chalk.bgCyan.black(display);
    } else if (showCursor && globalIndex === cursorPosition) {
      rendered += chalk.inverse(display[0] || " ") + display.slice(1);
    } else if (isImage) {
      // Subtle highlight for image placeholders
      rendered += chalk.dim.cyan(display);
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

  const imageDisplayNumbers = buildImageDisplayNumbers(value);
  const lines = value.split(/\r?\n/);

  // Build array of line start offsets in the original value
  const lineOffsets: number[] = [];
  let searchStart = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(searchStart);
    searchStart += lines[i]!.length;
    // Skip \r\n or \n
    if (searchStart < value.length && value[searchStart] === "\r") {
      searchStart += 2;
    } else if (searchStart < value.length && value[searchStart] === "\n") {
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
