import { createState } from "reactivity-store";

import type { Attachment } from "../types/attachment.js";

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

  // remount key
  key: number;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: UserInputState = {
  value: "",
  key: 0,
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

    /**
     * Append character(s) to input
     */
    append: (chars: string) => {
      state.value = state.value + chars;
      state.cursorPosition = state.value.length;
      state.historyIndex = -1;
    },

    /**
     * Handle backspace
     */
    backspace: () => {
      if (state.value.length > 0) {
        state.value = state.value.slice(0, -1);
        state.cursorPosition = state.value.length;
      }
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
      state.key++;
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
      state.key++;
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

    addRemountKey: () => state.key++,

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
