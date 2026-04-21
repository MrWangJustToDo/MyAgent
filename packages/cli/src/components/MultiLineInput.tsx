import chalk from "chalk";
import { Box, Text } from "ink";

import { IMAGE_PLACEHOLDER_START, IMAGE_PLACEHOLDER_END, getImageIndex } from "../hooks/use-user-input.js";

export interface MultiLineInputProps {
  value: string;
  cursorPosition: number;
  showCursor?: boolean;
  placeholder?: string;
  /** Whether all text is selected (Ctrl+A) */
  selectAll?: boolean;
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

/**
 * Custom multi-line input component replacing ink-text-input.
 * Renders text with a cursor using chalk.inverse, supports multiple lines.
 * Image placeholder characters (\uE000-\uE0FF) are rendered as [Image #N].
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
      return <Text>{rendered}</Text>;
    }
    return <Text>{chalk.inverse(" ")}</Text>;
  }

  if (!value) {
    return placeholder ? <Text color="gray">{placeholder}</Text> : null;
  }

  // Build display numbers for images (1, 2, 3... in order of appearance)
  const imageDisplayNumbers = buildImageDisplayNumbers(value);

  const lines = value.split("\n");

  // Compute which line and column the cursor is on
  let cursorLine = 0;
  let cursorCol = 0;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i]!.length;
    if (offset + lineLen >= cursorPosition && cursorPosition >= offset) {
      cursorLine = i;
      cursorCol = cursorPosition - offset;
      break;
    }
    offset += lineLen + 1; // +1 for the \n
    cursorLine = i + 1;
    cursorCol = 0;
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, lineIdx) => {
        let rendered = "";

        for (let i = 0; i < line.length; i++) {
          const char = line[i]!;
          const code = char.charCodeAt(0);
          const isCursorHere = showCursor && !selectAll && lineIdx === cursorLine && i === cursorCol;

          if (isImagePlaceholderCode(code)) {
            // Render image placeholder
            const imageIdx = getImageIndex(char);
            const displayNum = imageDisplayNumbers.get(imageIdx) ?? "?";
            const label = `[Image #${displayNum}]`;

            if (selectAll) {
              rendered += chalk.bgCyan.black(label);
            } else if (isCursorHere) {
              rendered += chalk.bgMagenta.white.bold(label);
            } else {
              rendered += chalk.magenta(label);
            }
          } else {
            // Render normal character
            if (selectAll) {
              rendered += chalk.bgCyan.black(char);
            } else if (isCursorHere) {
              rendered += chalk.inverse(char);
            } else {
              rendered += char;
            }
          }
        }

        // Cursor at end of line (only show if not selectAll)
        if (showCursor && !selectAll && lineIdx === cursorLine && cursorCol >= line.length) {
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
