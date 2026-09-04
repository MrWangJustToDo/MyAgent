import chalk from "chalk";
import { Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";

import { BG } from "../theme/colors.js";

// ============================================================================
// TextInput — shared single-line text input with full cursor editing
//
// Matches the app's MultiLineInput look (BG.input background + chalk.inverse
// block cursor) but is a lightweight controlled input for form fields: left/
// right/home/end navigation, insert/delete at the cursor, and Enter to submit.
// ============================================================================

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter; passes the current value. */
  onSubmit?: (value: string) => void;
  onEscape?: () => void;
  placeholder?: string;
  /** Mask the rendered value (e.g. API keys). */
  mask?: boolean;
  /** Disable editing entirely (e.g. while saving). */
  disabled?: boolean;
}

function renderWithCursor(value: string, cursor: number, placeholder: string): string {
  if (!value) {
    if (placeholder) {
      return chalk.inverse(placeholder[0] || " ") + chalk.gray(placeholder.slice(1));
    }
    return chalk.inverse(" ");
  }
  const before = value.slice(0, cursor);
  const at = value[cursor] || " ";
  const after = value.slice(cursor + 1);
  return before + chalk.inverse(at) + after;
}

export const TextInput = ({
  value,
  onChange,
  onSubmit,
  onEscape,
  placeholder = "",
  mask = false,
  disabled = false,
}: TextInputProps) => {
  const [cursor, setCursor] = useState(value.length);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // Keep the cursor within the current value when it changes externally.
  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value]);

  const display = mask ? "•".repeat(value.length) : value;

  useInput((input, key) => {
    if (disabled) return;

    if (key.escape) {
      onEscape?.();
      return;
    }
    if (key.return) {
      onSubmit?.(value);
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }
    if (key.home) {
      setCursor(0);
      return;
    }
    if (key.end) {
      setCursor(value.length);
      return;
    }
    if (key.backspace) {
      const c = cursorRef.current;
      if (c > 0) {
        onChange(value.slice(0, c - 1) + value.slice(c));
        setCursor(c - 1);
      }
      return;
    }
    if (key.delete) {
      const c = cursorRef.current;
      if (c < value.length) {
        onChange(value.slice(0, c) + value.slice(c + 1));
      }
      return;
    }
    if (input) {
      const c = cursorRef.current;
      const next = value.slice(0, c) + input + value.slice(c);
      onChange(next);
      setCursor(c + input.length);
    }
  });

  return (
    <Text backgroundColor={BG.input} wrap="truncate-end">
      {renderWithCursor(display, cursor, placeholder)}
    </Text>
  );
};
