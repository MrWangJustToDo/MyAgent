import chalk from "chalk";
import { Box, Text } from "ink";

import { IMAGE_PLACEHOLDER_START, IMAGE_PLACEHOLDER_END } from "../hooks/use-user-input.js";

export interface MultiLineInputProps {
  value: string;
  cursorPosition: number;
  showCursor?: boolean;
  placeholder?: string;
  /** Whether all text is selected (Ctrl+A) */
  selectAll?: boolean;
  /** Maximum width in characters per visual line. Wraps text at this width. */
  maxWidth?: number;
}

/** Check if a character code is an image placeholder */
function isImagePlaceholderCode(code: number): boolean {
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
}

/** Track which display number each image placeholder should show */
function buildImageDisplayNumbers(value: string): Map<number, number> {
  const displayNumbers = new Map<number, number>();
  let displayNum = 1;

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (isImagePlaceholderCode(code)) {
      const imageIdx = code - IMAGE_PLACEHOLDER_START;
      displayNumbers.set(imageIdx, displayNum++);
    }
  }

  return displayNumbers;
}

/** Get the visual display width of a character (image placeholders are wider) */
function getCharVisualWidth(char: string, imageDisplayNumbers: Map<number, number>): number {
  const code = char.charCodeAt(0);
  if (isImagePlaceholderCode(code)) {
    const imageIdx = code - IMAGE_PLACEHOLDER_START;
    const displayNum = imageDisplayNumbers.get(imageIdx) ?? 0;
    return `[Image #${displayNum}]`.length;
  }
  return 1;
}

/** Get the visual display text for a character (image placeholders are expanded) */
function getCharDisplay(char: string, imageDisplayNumbers: Map<number, number>): string {
  const code = char.charCodeAt(0);
  if (isImagePlaceholderCode(code)) {
    const imageIdx = code - IMAGE_PLACEHOLDER_START;
    const displayNum = imageDisplayNumbers.get(imageIdx) ?? "?";
    return `[Image #${displayNum}]`;
  }
  return char;
}

/**
 * Split text into visual lines based on maxWidth.
 * Respects explicit \n characters and wraps long lines at the given width.
 * Image placeholder characters are expanded to their full label (e.g. "[Image #1]").
 */
function getVisualLines(value: string, maxWidth: number, imageDisplayNumbers: Map<number, number>): string[] {
  const lines: string[] = [];

  for (const rawLine of value.split("\n")) {
    let currentLine = "";
    let currentWidth = 0;

    for (const char of rawLine) {
      const w = getCharVisualWidth(char, imageDisplayNumbers);
      const display = getCharDisplay(char, imageDisplayNumbers);

      // If adding this char exceeds maxWidth, wrap to next line first
      if (currentWidth + w > maxWidth && currentWidth > 0) {
        lines.push(currentLine);
        currentLine = display;
        currentWidth = w;
      } else {
        currentLine += display;
        currentWidth += w;
      }
    }

    lines.push(currentLine);
  }

  return lines;
}

/**
 * Convert an absolute character position in the raw value string to
 * (visualLine, visualCol) coordinates in the wrapped display.
 */
function getCursorVisualPosition(
  value: string,
  cursorPosition: number,
  maxWidth: number,
  imageDisplayNumbers: Map<number, number>
): { line: number; col: number } {
  let line = 0;
  let col = 0;
  let currentLineWidth = 0;

  for (let i = 0; i < cursorPosition; i++) {
    const char = value[i]!;

    if (char === "\n") {
      line++;
      col = 0;
      currentLineWidth = 0;
      continue;
    }

    const w = getCharVisualWidth(char, imageDisplayNumbers);

    // Check if this character would exceed maxWidth
    if (currentLineWidth + w > maxWidth) {
      line++;
      col = w;
      currentLineWidth = w;
    } else {
      col += w;
      currentLineWidth += w;
    }
  }

  return { line, col };
}

/**
 * Custom multi-line input component replacing ink-text-input.
 * Renders text with a cursor using chalk.inverse, supports multiple lines.
 * Wraps text at maxWidth for visual line breaks.
 * Image placeholder characters (\uE000-\uE0FF) are rendered as [Image #N].
 */
export const MultiLineInput = ({
  value,
  cursorPosition,
  showCursor = true,
  placeholder = "",
  selectAll = false,
  maxWidth = 80,
}: MultiLineInputProps) => {
  if (!value && showCursor) {
    if (placeholder) {
      const rendered = chalk.inverse(placeholder[0] || " ") + chalk.gray(placeholder.slice(1));
      return <Text>{rendered}</Text>;
    }
    return <Text>{chalk.inverse(" ")}</Text>;
  }

  if (!value) {
    return placeholder ? <Text color="gray">{placeholder}</Text> : null;
  }

  // Build display numbers for images (1, 2, 3... in order of appearance)
  const imageDisplayNumbers = buildImageDisplayNumbers(value);

  // Get visual lines with width-based wrapping
  const visualLines = getVisualLines(value, maxWidth, imageDisplayNumbers);

  // Compute cursor position in visual coordinates
  const cursorPos = getCursorVisualPosition(value, cursorPosition, maxWidth, imageDisplayNumbers);

  return (
    <Box flexDirection="column">
      {visualLines.map((line, lineIdx) => {
        let rendered = "";

        for (let i = 0; i < line.length; i++) {
          const char = line[i]!;
          const isCursorHere = showCursor && !selectAll && lineIdx === cursorPos.line && i === cursorPos.col;

          if (selectAll) {
            rendered += chalk.bgCyan.black(char);
          } else if (isCursorHere) {
            rendered += chalk.inverse(char);
          } else {
            rendered += char;
          }
        }

        // Cursor at end of line (only show if not selectAll)
        if (showCursor && !selectAll && lineIdx === cursorPos.line && cursorPos.col >= line.length) {
          rendered += chalk.inverse(" ");
        }

        if (!rendered && !showCursor) {
          rendered = " "; // empty lines need at least a space for height
        }

        return (
          <Box key={lineIdx}>
            <Text>{rendered}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
