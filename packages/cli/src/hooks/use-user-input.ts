import { createState } from "reactivity-store";

import type { Attachment } from "../types/attachment.js";
import type { Key } from "ink";

// ============================================================================
// Constants
// ============================================================================

/**
 * Unicode Private Use Area characters for image placeholders.
 * Each image gets a unique character: \uE000, \uE001, \uE002, etc.
 * This allows images to be treated as single characters in the input string.
 */
export const IMAGE_PLACEHOLDER_START = 0xe000;
export const IMAGE_PLACEHOLDER_END = 0xe0ff;

/** Check if a character is an image placeholder */
export function isImagePlaceholder(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
}

/** Get the image index from a placeholder character */
export function getImageIndex(char: string): number {
  return char.charCodeAt(0) - IMAGE_PLACEHOLDER_START;
}

/** Create a placeholder character for an image index */
export function createImagePlaceholder(index: number): string {
  return String.fromCharCode(IMAGE_PLACEHOLDER_START + index);
}

// ============================================================================
// Types
// ============================================================================

export interface UserInputState {
  /** Current input value (may contain image placeholder characters) */
  value: string;
  /** Input history */
  history: string[];
  /** Current history index (-1 means current input) */
  historyIndex: number;
  /** Whether input is focused/active */
  focused: boolean;
  /** Cursor position */
  cursorPosition: number;
  /** Whether all text is selected (Ctrl+A) */
  selectAll: boolean;
  /** */
  loading: boolean;
  /** Pending file attachments (indexed by placeholder character) */
  attachments: Attachment[];
  /** Currently selected attachment index (-1 means none selected) */
  selectedAttachment: number;
  /** Error message to display (e.g. file validation failure) */
  inputError: string | null;
  /** Feedback message from commands (success/info/error) */
  inputFeedback: { text: string; type: "success" | "info" | "error" } | null;
  /** Next image index to use for placeholder */
  nextImageIndex: number;

  // debug only
  event: any[];
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: UserInputState = {
  event: [],
  value: "",
  history: [],
  historyIndex: -1,
  focused: true,
  cursorPosition: 0,
  selectAll: false,
  loading: false,
  attachments: [],
  selectedAttachment: -1,
  inputError: null,
  inputFeedback: null,
  nextImageIndex: 0,
};

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global user input state hook (zustand-like API from reactivity-store)
 *
 * @example
 * ```tsx
 * // Use in components (reactive)
 * const { value, focused } = useUserInput();
 *
 * // Select specific state (reactive, optimized re-renders)
 * const value = useUserInput((s) => s.value);
 *
 * // Get actions (non-reactive, can call anywhere)
 * const { setValue, append, backspace, submit } = useUserInput.getActions();
 * ```
 */
export const useUserInput = createState(() => ({ ...initialState }), {
  withActions: (state) => ({
    /**
     * Set the entire input value
     */
    setValue: (value: string) => {
      state.value = value;
      state.cursorPosition = value.length;
      state.historyIndex = -1;
      state.selectAll = false;
    },

    /**
     * Select all text (Ctrl+A)
     */
    setSelectAll: (selected: boolean) => {
      state.selectAll = selected && state.value.length > 0;
    },

    addEvent: (chart: string, key: Key) => {
      state.event.push({ chart, key });
    },

    /**
     * Insert character(s) at cursor position
     * If selectAll is true, replaces everything with the new chars.
     */
    append: (chars: string) => {
      // If all selected, replace everything
      if (state.selectAll) {
        state.value = chars;
        state.cursorPosition = chars.length;
        state.attachments = [];
        state.nextImageIndex = 0;
        state.selectAll = false;
        state.historyIndex = -1;
        return;
      }

      const pos = state.cursorPosition;
      state.value = state.value.slice(0, pos) + chars + state.value.slice(pos);
      state.cursorPosition = pos + chars.length;
      state.historyIndex = -1;
    },

    /**
     * Delete character before cursor (backspace)
     * If selectAll is true, clears everything.
     * If the character is an image placeholder, also removes the attachment.
     */
    backspace: () => {
      // If all selected, clear everything
      if (state.selectAll) {
        state.value = "";
        state.cursorPosition = 0;
        state.attachments = [];
        state.nextImageIndex = 0;
        state.selectAll = false;
        return;
      }

      if (state.cursorPosition > 0) {
        const pos = state.cursorPosition;
        const charToDelete = state.value[pos - 1];

        // Check if we're deleting an image placeholder
        if (charToDelete && isImagePlaceholder(charToDelete)) {
          const imageIdx = getImageIndex(charToDelete);
          // Remove the attachment
          state.attachments = state.attachments
            .map((a, i) => (i === imageIdx ? null : a))
            .filter(Boolean) as Attachment[];
        }

        state.value = state.value.slice(0, pos - 1) + state.value.slice(pos);
        state.cursorPosition = pos - 1;
      }
    },

    /**
     * Delete character after cursor (forward delete)
     * If the character is an image placeholder, also removes the attachment
     */
    deleteForward: () => {
      if (state.cursorPosition < state.value.length) {
        const pos = state.cursorPosition;
        const charToDelete = state.value[pos];

        // Check if we're deleting an image placeholder
        if (charToDelete && isImagePlaceholder(charToDelete)) {
          const imageIdx = getImageIndex(charToDelete);
          // Remove the attachment
          state.attachments = state.attachments
            .map((a, i) => (i === imageIdx ? null : a))
            .filter(Boolean) as Attachment[];
        }

        state.value = state.value.slice(0, pos) + state.value.slice(pos + 1);
      }
    },

    /**
     * Insert a newline at cursor position (Shift+Enter)
     */
    insertNewline: () => {
      const pos = state.cursorPosition;
      state.value = state.value.slice(0, pos) + "\n" + state.value.slice(pos);
      state.cursorPosition = pos + 1;
      state.historyIndex = -1;
    },

    /**
     * Move cursor left. Wraps to end of previous line.
     */
    moveCursorLeft: () => {
      state.selectAll = false;
      if (state.cursorPosition > 0) {
        state.cursorPosition -= 1;
      }
    },

    /**
     * Move cursor right. Wraps to start of next line.
     */
    moveCursorRight: () => {
      state.selectAll = false;
      if (state.cursorPosition < state.value.length) {
        state.cursorPosition += 1;
      }
    },

    /**
     * Move cursor up one line. Returns false if already on first line.
     */
    moveCursorUp: (): boolean => {
      state.selectAll = false;
      const val = state.value;
      const pos = state.cursorPosition;
      // Find start of current line
      const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
      if (lineStart === 0) return false; // already on first line
      // Column in current line
      const col = pos - lineStart;
      // Find start of previous line
      const prevLineStart = val.lastIndexOf("\n", lineStart - 2) + 1;
      const prevLineLen = lineStart - 1 - prevLineStart;
      state.cursorPosition = prevLineStart + Math.min(col, prevLineLen);
      return true;
    },

    /**
     * Move cursor down one line. Returns false if already on last line.
     */
    moveCursorDown: (): boolean => {
      state.selectAll = false;
      const val = state.value;
      const pos = state.cursorPosition;
      // Find end of current line
      const lineEnd = val.indexOf("\n", pos);
      if (lineEnd === -1) return false; // already on last line
      // Column in current line
      const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
      const col = pos - lineStart;
      // Find end of next line
      const nextLineStart = lineEnd + 1;
      const nextLineEnd = val.indexOf("\n", nextLineStart);
      const nextLineLen = (nextLineEnd === -1 ? val.length : nextLineEnd) - nextLineStart;
      state.cursorPosition = nextLineStart + Math.min(col, nextLineLen);
      return true;
    },

    /**
     * Clear input
     */
    clear: () => {
      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.attachments = [];
      state.nextImageIndex = 0;
    },

    /**
     * Submit current input and add to history
     * Returns the submitted text (with placeholders removed) and any attachments in order
     */
    submit: (): { text: string; attachments: Attachment[] } => {
      const rawValue = state.value;

      // Extract text without image placeholders and collect attachments in order
      let text = "";
      const orderedAttachments: Attachment[] = [];

      for (const char of rawValue) {
        if (isImagePlaceholder(char)) {
          const idx = getImageIndex(char);
          const attachment = state.attachments[idx];
          if (attachment) {
            orderedAttachments.push(attachment);
          }
        } else {
          text += char;
        }
      }

      text = text.trim();

      if (text) {
        // Add to history (avoid duplicates) - store without placeholders
        if (state.history[state.history.length - 1] !== text) {
          state.history = [...state.history, text];
        }
      }

      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.attachments = [];
      state.selectedAttachment = -1;
      state.inputError = null;
      state.nextImageIndex = 0;
      return { text, attachments: orderedAttachments };
    },

    /**
     * Navigate to previous history entry
     */
    historyPrev: () => {
      if (state.history.length === 0) return;

      if (state.historyIndex === -1) {
        // Start from most recent
        state.historyIndex = state.history.length - 1;
      } else if (state.historyIndex > 0) {
        state.historyIndex -= 1;
      }

      state.value = state.history[state.historyIndex] ?? "";
      state.cursorPosition = state.value.length;
    },

    /**
     * Navigate to next history entry
     */
    historyNext: () => {
      if (state.historyIndex === -1) return;

      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex += 1;
        state.value = state.history[state.historyIndex] ?? "";
      } else {
        // Back to current input
        state.historyIndex = -1;
        state.value = "";
      }
      state.cursorPosition = state.value.length;
    },

    /**
     * Set focus state
     */
    setFocused: (focused: boolean) => {
      state.focused = focused;
    },

    setLoading: (l?: boolean) => {
      state.loading = !!l;
    },

    /**
     * Add a file attachment and insert placeholder at cursor position
     */
    addAttachment: (attachment: Attachment) => {
      const imageIndex = state.nextImageIndex;
      const placeholder = createImagePlaceholder(imageIndex);

      // Store attachment at the index
      const newAttachments = [...state.attachments];
      newAttachments[imageIndex] = attachment;
      state.attachments = newAttachments;

      // Insert placeholder at cursor position
      const pos = state.cursorPosition;
      state.value = state.value.slice(0, pos) + placeholder + state.value.slice(pos);
      state.cursorPosition = pos + 1;

      state.nextImageIndex = imageIndex + 1;
      state.selectedAttachment = -1;
      state.inputError = null;
    },

    /**
     * Check if there are any image attachments in the current value
     */
    hasAttachments: (): boolean => {
      for (const char of state.value) {
        if (isImagePlaceholder(char)) {
          return true;
        }
      }
      return false;
    },

    /**
     * Set an error message
     */
    setInputError: (error: string | null) => {
      state.inputError = error;

      setTimeout(() => (state.inputError = null), 2000);
    },

    /**
     * Set a feedback message (success/info/error) from commands
     */
    setInputFeedback: (text: string | null, type: "success" | "info" | "error" = "info") => {
      state.inputFeedback = text ? { text, type } : null;

      if (text) {
        setTimeout(() => (state.inputFeedback = null), 3000);
      }
    },

    /**
     * Reset to initial state
     */
    reset: () => {
      state.value = "";
      state.history = [];
      state.historyIndex = -1;
      state.focused = true;
      state.cursorPosition = 0;
      state.selectAll = false;
      state.loading = false;
      state.attachments = [];
      state.selectedAttachment = -1;
      state.inputError = null;
      state.nextImageIndex = 0;
    },
  }),

  withDeepSelector: false,

  withStableSelector: true,

  withNamespace: "useUserInput",
});

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get input actions (non-reactive)
 */
export const getInputActions = () => useUserInput.getActions();
