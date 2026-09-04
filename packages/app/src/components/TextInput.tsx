import chalk from "chalk";
import { Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";

// ============================================================================
// TextInput — shared single-line text input with full cursor editing
//
// A lightweight controlled input for form fields. The value renders with a
// chalk.inverse block cursor: left/right/home/end (and Ctrl+A/E/B/F) navigation,
// insert/delete/backspace, word and line deletion (Ctrl+W/U/K), and Enter to
// submit.
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

/** Remove the word immediately before `cursor`; returns [newValue, newCursor]. */
function deleteWordBefore(value: string, cursor: number): [string, number] {
  const before = value.slice(0, cursor);
  let end = before.length;
  while (end > 0 && /\s/.test(before[end - 1]!)) end--;
  let start = end;
  while (start > 0 && !/\s/.test(before[start - 1]!)) start--;
  return [value.slice(0, start) + value.slice(cursor), start];
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

    // Ctrl shortcuts — word/line deletion and fast navigation (readline-style).
    // NOTE: react-terminal passes the letter itself (e.g. "a") for Ctrl+letter
    // combinations (with key.ctrl = true), NOT the control char (\x01). Match
    // the keybindings in hooks/keybindings/*.ts which compare input.toLowerCase().
    if (key.ctrl && input) {
      const ch = input.toLowerCase();
      const c = cursorRef.current;
      if (ch === "a") {
        setCursor(0); // Ctrl+A — start
        return;
      }
      if (ch === "e") {
        setCursor(value.length); // Ctrl+E — end
        return;
      }
      if (ch === "b") {
        setCursor((cur) => Math.max(0, cur - 1)); // Ctrl+B — back
        return;
      }
      if (ch === "f") {
        setCursor((cur) => Math.min(value.length, cur + 1)); // Ctrl+F — forward
        return;
      }
      if (ch === "d") {
        if (c < value.length) onChange(value.slice(0, c) + value.slice(c + 1)); // Ctrl+D — delete char
        return;
      }
      if (ch === "u") {
        onChange(value.slice(c)); // Ctrl+U — delete to start
        setCursor(0);
        return;
      }
      if (ch === "k") {
        onChange(value.slice(0, c)); // Ctrl+K — delete to end
        return;
      }
      if (ch === "w") {
        const [next, nc] = deleteWordBefore(value, c); // Ctrl+W — delete word before
        onChange(next);
        setCursor(nc);
        return;
      }
    }

    if (input) {
      const c = cursorRef.current;
      const next = value.slice(0, c) + input + value.slice(c);
      onChange(next);
      setCursor(c + input.length);
    }
  });

  return <Text wrap="truncate-end">{renderWithCursor(display, cursor, placeholder)}</Text>;
};
