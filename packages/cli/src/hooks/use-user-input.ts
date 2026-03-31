import { createState } from "reactivity-store";

import type { Attachment } from "../types/attachment.js";
import type { Key } from "ink";

// ============================================================================
// Types
// ============================================================================

export interface UserInputState {
  /** Current input value */
  value: string;
  /** Input history */
  history: string[];
  /** Current history index (-1 means current input) */
  historyIndex: number;
  /** Whether input is focused/active */
  focused: boolean;
  /** Cursor position */
  cursorPosition: number;
  /** */
  loading: boolean;
  /** Pending file attachments */
  attachments: Attachment[];
  /** Currently selected attachment index (-1 means none selected) */
  selectedAttachment: number;
  /** Error message to display (e.g. file validation failure) */
  inputError: string | null;

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
  loading: false,
  attachments: [],
  selectedAttachment: -1,
  inputError: null,
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
    },

    addEvent: (chart: string, key: Key) => {
      state.event.push({ chart, key });
    },

    /**
     * Insert character(s) at cursor position
     */
    append: (chars: string) => {
      const pos = state.cursorPosition;
      state.value = state.value.slice(0, pos) + chars + state.value.slice(pos);
      state.cursorPosition = pos + chars.length;
      state.historyIndex = -1;
    },

    /**
     * Delete character before cursor (backspace)
     */
    backspace: () => {
      if (state.cursorPosition > 0) {
        const pos = state.cursorPosition;
        state.value = state.value.slice(0, pos - 1) + state.value.slice(pos);
        state.cursorPosition = pos - 1;
      }
    },

    /**
     * Delete character after cursor (forward delete)
     */
    deleteForward: () => {
      if (state.cursorPosition < state.value.length) {
        const pos = state.cursorPosition;
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
      if (state.cursorPosition > 0) {
        state.cursorPosition -= 1;
      }
    },

    /**
     * Move cursor right. Wraps to start of next line.
     */
    moveCursorRight: () => {
      if (state.cursorPosition < state.value.length) {
        state.cursorPosition += 1;
      }
    },

    /**
     * Move cursor up one line. Returns false if already on first line.
     */
    moveCursorUp: (): boolean => {
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
    },

    /**
     * Submit current input and add to history
     * Returns the submitted text and any attachments
     */
    submit: (): { text: string; attachments: Attachment[] } => {
      const value = state.value.trim();
      const attachments = [...state.attachments];
      if (value) {
        // Add to history (avoid duplicates)
        if (state.history[state.history.length - 1] !== value) {
          state.history = [...state.history, value];
        }
      }
      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.attachments = [];
      state.selectedAttachment = -1;
      state.inputError = null;
      return { text: value, attachments };
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
     * Add a file attachment
     */
    addAttachment: (attachment: Attachment) => {
      state.attachments = [...state.attachments, attachment];
      state.selectedAttachment = -1;
      state.inputError = null;
    },

    /**
     * Remove an attachment by index (0-based)
     */
    removeAttachment: (index: number) => {
      state.attachments = state.attachments.filter((_, i) => i !== index);
      // Adjust selection
      if (state.attachments.length === 0) {
        state.selectedAttachment = -1;
      } else if (state.selectedAttachment >= state.attachments.length) {
        state.selectedAttachment = state.attachments.length - 1;
      }
    },

    /**
     * Remove the currently selected attachment
     */
    removeSelectedAttachment: () => {
      if (state.selectedAttachment < 0 || state.selectedAttachment >= state.attachments.length) return;
      const idx = state.selectedAttachment;
      state.attachments = state.attachments.filter((_, i) => i !== idx);
      if (state.attachments.length === 0) {
        state.selectedAttachment = -1;
      } else if (state.selectedAttachment >= state.attachments.length) {
        state.selectedAttachment = state.attachments.length - 1;
      }
    },

    /**
     * Select previous attachment (Up). First press enters selection at last item.
     * Returns true if selection moved, false if already at top (caller can do history nav).
     */
    selectPrevAttachment: (): boolean => {
      if (state.attachments.length === 0) return false;
      if (state.selectedAttachment === -1) {
        // Enter selection at last item
        state.selectedAttachment = state.attachments.length - 1;
        return true;
      }
      if (state.selectedAttachment > 0) {
        state.selectedAttachment -= 1;
        return true;
      }
      // Already at top — can't go further
      return true;
    },

    /**
     * Select next attachment (Down). If at last item, deselects (exits selection).
     * Returns true if handled, false if not in selection mode.
     */
    selectNextAttachment: (): boolean => {
      if (state.attachments.length === 0) return false;
      if (state.selectedAttachment === -1) return false;
      if (state.selectedAttachment < state.attachments.length - 1) {
        state.selectedAttachment += 1;
      } else {
        // Exit selection
        state.selectedAttachment = -1;
      }
      return true;
    },

    /**
     * Deselect any attachment
     */
    deselectAttachment: () => {
      state.selectedAttachment = -1;
    },

    /**
     * Clear all attachments
     */
    clearAttachments: () => {
      state.attachments = [];
      state.selectedAttachment = -1;
    },

    /**
     * Set an error message
     */
    setInputError: (error: string | null) => {
      state.inputError = error;

      setTimeout(() => (state.inputError = null), 2000);
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
      state.loading = false;
      state.attachments = [];
      state.selectedAttachment = -1;
      state.inputError = null;
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
