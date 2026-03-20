import { createState } from "reactivity-store";

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
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: UserInputState = {
  value: "",
  history: [],
  historyIndex: -1,
  focused: true,
  cursorPosition: 0,
  loading: false,
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
     * Returns the submitted value
     */
    submit: (): string => {
      const value = state.value.trim();
      if (value) {
        // Add to history (avoid duplicates)
        if (state.history[state.history.length - 1] !== value) {
          state.history = [...state.history, value];
        }
      }
      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      return value;
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
     * Reset to initial state
     */
    reset: () => {
      state.value = "";
      state.history = [];
      state.historyIndex = -1;
      state.focused = true;
      state.cursorPosition = 0;
      state.loading = false;
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
