import chalk from "chalk";
import { Box, Text } from "ink";

export interface MultiLineInputProps {
  value: string;
  cursorPosition: number;
  showCursor?: boolean;
  placeholder?: string;
}

/**
 * Custom multi-line input component replacing ink-text-input.
 * Renders text with a cursor using chalk.inverse, supports multiple lines.
 */
export const MultiLineInput = ({ value, cursorPosition, showCursor = true, placeholder = "" }: MultiLineInputProps) => {
  if (!value && showCursor) {
    // Empty input — show placeholder with cursor on first char
    if (placeholder) {
      const rendered = chalk.inverse(placeholder[0] || " ") + chalk.gray(placeholder.slice(1));
      return <Text>{rendered}</Text>;
    }
    return <Text>{chalk.inverse(" ")}</Text>;
  }

  if (!value) {
    return placeholder ? <Text color="gray">{placeholder}</Text> : null;
  }

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
        let rendered: string;

        if (showCursor && lineIdx === cursorLine) {
          // Render this line with cursor
          rendered = "";
          for (let i = 0; i < line.length; i++) {
            rendered += i === cursorCol ? chalk.inverse(line[i]) : line[i];
          }
          // Cursor at end of line
          if (cursorCol >= line.length) {
            rendered += chalk.inverse(" ");
          }
        } else {
          rendered = line || " "; // empty lines need at least a space for height
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
