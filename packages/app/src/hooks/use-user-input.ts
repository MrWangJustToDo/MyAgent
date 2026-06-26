import { createState } from "reactivity-store";

import { useNotification } from "./use-notification.js";
import {
  appendHistoryEntry,
  createImagePlaceholder,
  extractSubmittedInput,
  getImageIndex,
  hasImagePlaceholder,
  isImagePlaceholder,
  removeAttachmentAtIndex,
} from "./user-input-helpers.js";

import type { Attachment } from "../types/attachment.js";
import type { Key } from "ink";

export {
  IMAGE_PLACEHOLDER_END,
  IMAGE_PLACEHOLDER_START,
  createImagePlaceholder,
  getImageIndex,
  isImagePlaceholder,
} from "./user-input-helpers.js";

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
      // Convert \r\n and \r to \n for proper newline handling
      chars = chars.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

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
          state.attachments = removeAttachmentAtIndex(state.attachments, getImageIndex(charToDelete));
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
          state.attachments = removeAttachmentAtIndex(state.attachments, getImageIndex(charToDelete));
        }

        state.value = state.value.slice(0, pos) + state.value.slice(pos + 1);
      }
    },

    /**
     * Move cursor left.
     */
    moveCursorLeft: () => {
      state.selectAll = false;
      if (state.cursorPosition > 0) {
        state.cursorPosition -= 1;
      }
    },

    /**
     * Move cursor right.
     */
    moveCursorRight: () => {
      state.selectAll = false;
      if (state.cursorPosition < state.value.length) {
        state.cursorPosition += 1;
      }
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
      const { text, attachments } = extractSubmittedInput(state.value, state.attachments);
      state.history = appendHistoryEntry(state.history, text);

      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.attachments = [];
      state.selectedAttachment = -1;
      state.nextImageIndex = 0;
      return { text, attachments };
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
    },

    /**
     * Check if there are any image attachments in the current value
     */
    hasAttachments: (): boolean => {
      return hasImagePlaceholder(state.value);
    },

    /**
     * Show an error notification.
     */
    setInputError: (error: string | null) => {
      if (error) {
        useNotification.getActions().setNotification({
          id: `input-error-${Date.now()}`,
          category: "system",
          level: "error",
          message: error,
          timestamp: Date.now(),
        });
      }
    },

    /**
     * Show a feedback notification (success/info/error).
     */
    setInputFeedback: (text: string | null, type: "success" | "info" | "error" = "info") => {
      if (text) {
        const levelMap = { success: "success", info: "info", error: "error" } as const;
        useNotification.getActions().setNotification({
          id: `input-feedback-${Date.now()}`,
          category: "system",
          level: levelMap[type],
          message: text,
          timestamp: Date.now(),
        });
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
