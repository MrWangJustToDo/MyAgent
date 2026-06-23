import chalk from "chalk";
import { Text } from "ink";

import { IMAGE_PLACEHOLDER_START, IMAGE_PLACEHOLDER_END } from "../hooks/use-user-input.js";

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

function getCharDisplay(char: string, imageDisplayNumbers: Map<number, number>): string {
  const code = char.charCodeAt(0);
  if (isImagePlaceholderCode(code)) {
    const displayNum = imageDisplayNumbers.get(code - IMAGE_PLACEHOLDER_START) ?? "?";
    return `[Image #${displayNum}]`;
  }
  return char;
}

/**
 * Simple input component — renders text with a chalk.inverse cursor
 * and lets Ink's native `wrap="wrap"` handle line wrapping.
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
    return placeholder ? <Text color="gray">{placeholder}</Text> : null;
  }

  const imageDisplayNumbers = buildImageDisplayNumbers(value);

  // Build a single styled string: expand image placeholders,
  // apply chalk.inverse at cursor position, chalk.bgCyan for select-all.
  let rendered = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    const display = getCharDisplay(char, imageDisplayNumbers);

    if (selectAll) {
      rendered += chalk.bgCyan.black(display);
    } else if (showCursor && i === cursorPosition) {
      rendered += chalk.inverse(display[0] || " ") + display.slice(1);
    } else {
      rendered += display;
    }
  }

  // Cursor at end of value
  if (showCursor && !selectAll && cursorPosition >= value.length) {
    rendered += chalk.inverse(" ");
  }

  return <Text wrap="wrap">{rendered}</Text>;
};
